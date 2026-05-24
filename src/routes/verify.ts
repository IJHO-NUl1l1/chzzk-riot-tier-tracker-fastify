import { FastifyInstance } from 'fastify';
import { getSupabase } from '../lib/supabase';
import { requireSelf } from '../lib/auth';
import { cachedGet, freshGet, getRegionHost } from '../lib/riot-api';

const ICON_ID_MIN = 1;
const ICON_ID_MAX = 28;
const SESSION_TTL_MS = 5 * 60 * 1000;

function pickRandomIconId(exclude: number): number {
  let id: number;
  do {
    id = Math.floor(Math.random() * (ICON_ID_MAX - ICON_ID_MIN + 1)) + ICON_ID_MIN;
  } while (id === exclude);
  return id;
}

async function getSummonerIconId(puuid: string, region: string, gameType: string, apiKey: string, useCache = true): Promise<number | null> {
  const regionHost = getRegionHost(region);
  if (!regionHost) return null;
  const path = gameType === 'tft'
    ? `tft/summoner/v1/summoners/by-puuid/${encodeURIComponent(puuid)}`
    : `lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(puuid)}`;
  const url = `https://${regionHost}/${path}`;
  const data = await (useCache ? cachedGet : freshGet)(url, apiKey) as { profileIconId?: number };
  return data.profileIconId ?? null;
}

export async function verifyRoute(app: FastifyInstance) {
  app.post('/api/verify/start', async (request, reply) => {
    const body = request.body as {
      chzzkChannelId?: string;
      puuid?: string;
      gameType?: string;
      region?: string;
    };
    const { chzzkChannelId, puuid, gameType, region } = body;

    if (!chzzkChannelId || !puuid || !gameType || !region) {
      return reply.status(400).send({ error: 'chzzkChannelId, puuid, gameType, region are required' });
    }
    if (!await requireSelf(request, reply, chzzkChannelId)) return;

    const apiKey = gameType === 'tft'
      ? (process.env.RIOT_TFT_API_KEY || process.env.RIOT_LOL_API_KEY)
      : process.env.RIOT_LOL_API_KEY;
    if (!apiKey) return reply.status(500).send({ error: 'No API key available' });

    let currentIconId: number | null;
    try {
      currentIconId = await getSummonerIconId(puuid, region, gameType, apiKey);
    } catch (err: any) {
      const status = err.response?.status || 500;
      return reply.status(status).send({
        error: 'Failed to fetch summoner info',
        details: err.message,
        riotStatus: err.response?.status,
        riotData: err.response?.data,
      });
    }

    const requiredIconId = pickRandomIconId(currentIconId ?? -1);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

    const { error } = await getSupabase()
      .from('verification_sessions')
      .upsert(
        {
          chzzk_channel_id: chzzkChannelId,
          puuid,
          game_type: gameType,
          required_icon_id: requiredIconId,
          expires_at: expiresAt,
        },
        { onConflict: 'chzzk_channel_id,game_type' }
      );

    if (error) return reply.status(500).send({ error: error.message });

    return reply.send({ iconId: requiredIconId, expiresAt });
  });

  app.post('/api/verify/confirm', async (request, reply) => {
    const body = request.body as {
      chzzkChannelId?: string;
      puuid?: string;
      gameType?: string;
      region?: string;
    };
    const { chzzkChannelId, puuid, gameType, region } = body;

    if (!chzzkChannelId || !puuid || !gameType || !region) {
      return reply.status(400).send({ error: 'chzzkChannelId, puuid, gameType, region are required' });
    }
    if (!await requireSelf(request, reply, chzzkChannelId)) return;

    const { data: session, error: sessionError } = await getSupabase()
      .from('verification_sessions')
      .select('required_icon_id, expires_at')
      .eq('chzzk_channel_id', chzzkChannelId)
      .eq('puuid', puuid)
      .eq('game_type', gameType)
      .single();

    if (sessionError || !session) {
      return reply.status(404).send({ error: 'Verification session not found. Please start again.' });
    }

    if (new Date(session.expires_at) < new Date()) {
      return reply.status(410).send({ error: 'Verification session expired. Please start again.' });
    }

    const apiKey = gameType === 'tft'
      ? (process.env.RIOT_TFT_API_KEY || process.env.RIOT_LOL_API_KEY)
      : process.env.RIOT_LOL_API_KEY;
    if (!apiKey) return reply.status(500).send({ error: 'No API key available' });

    let currentIconId: number | null;
    try {
      currentIconId = await getSummonerIconId(puuid, region, gameType, apiKey, false);
    } catch (err: any) {
      const status = err.response?.status || 500;
      return reply.status(status).send({ error: 'Failed to fetch summoner info', details: err.message });
    }

    if (currentIconId !== session.required_icon_id) {
      return reply.status(400).send({
        error: 'Icon does not match. Please change your profile icon and try again.',
        required: session.required_icon_id,
        current: currentIconId,
      });
    }

    const { error: updateError } = await getSupabase()
      .from('tier_cache')
      .update({ is_verified: true })
      .eq('chzzk_channel_id', chzzkChannelId)
      .eq('game_type', gameType);

    if (updateError) return reply.status(500).send({ error: updateError.message });

    await getSupabase()
      .from('verification_sessions')
      .delete()
      .eq('chzzk_channel_id', chzzkChannelId)
      .eq('game_type', gameType);

    return reply.send({ success: true });
  });
}
