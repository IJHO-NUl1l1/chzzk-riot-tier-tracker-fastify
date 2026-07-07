import { FastifyInstance } from 'fastify';
import { getSupabase } from '../../lib/supabase';
import { requireSelf } from '../../lib/auth';
import { broadcastToChannel } from '../../lib/realtime';
import { invalidateTierCache } from '../../lib/tier-store';
import { freshGet, getRegionHost } from '../../lib/riot-api';
import { gameTypeSchema, nonEmptyString, nullableString } from '../../schemas/common';

// currentTier/currentRank는 익스텐션이 언랭 상태에서 명시적 null을 보내므로
// nullable로 선언해야 한다 (liveId/gameType처럼 falsy 시 생략되는 필드와 다름).
const refreshSchema = {
  body: {
    type: 'object',
    properties: {
      chzzkChannelId: nonEmptyString,
      gameType: gameTypeSchema,
      region: nonEmptyString,
      currentTier: nullableString,
      currentRank: nullableString,
      currentLP: { type: ['number', 'null'] },
      liveId: { type: ['string', 'null'] },
    },
    required: ['chzzkChannelId', 'gameType', 'region'],
  },
};

const QUEUE_TYPE: Record<string, string> = {
  lol: 'RANKED_SOLO_5x5',
  tft: 'RANKED_TFT',
};

const REFRESH_COOLDOWN_MS = 5 * 60 * 1000;
const refreshTimestamps = new Map<string, number>();

function checkRateLimit(chzzkChannelId: string, gameType: string): number {
  const key = `${chzzkChannelId}:${gameType}`;
  const last = refreshTimestamps.get(key) ?? 0;
  const remaining = REFRESH_COOLDOWN_MS - (Date.now() - last);
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

function markRefreshed(chzzkChannelId: string, gameType: string): void {
  refreshTimestamps.set(`${chzzkChannelId}:${gameType}`, Date.now());
}

async function fetchFreshTier(
  puuid: string,
  region: string,
  gameType: string
): Promise<{ tier: string | null; rank: string | null; leaguePoints: number; wins: number; losses: number } | null> {
  const regionHost = getRegionHost(region);
  if (!regionHost) return null;

  const apiKey = gameType === 'tft'
    ? (process.env.RIOT_TFT_API_KEY || process.env.RIOT_LOL_API_KEY)
    : process.env.RIOT_LOL_API_KEY;
  if (!apiKey) return null;

  const path = gameType === 'tft'
    ? `tft/league/v1/by-puuid/${encodeURIComponent(puuid)}`
    : `lol/league/v4/entries/by-puuid/${encodeURIComponent(puuid)}`;

  const url = `https://${regionHost}/${path}`;
  const data = await freshGet(url, apiKey) as any[];

  const queueType = QUEUE_TYPE[gameType];
  const entry = Array.isArray(data) ? data.find((e) => e.queueType === queueType) : null;

  if (!entry) {
    return { tier: null, rank: null, leaguePoints: 0, wins: 0, losses: 0 };
  }

  return {
    tier: entry.tier ?? null,
    rank: entry.rank ?? null,
    leaguePoints: entry.leaguePoints ?? 0,
    wins: entry.wins ?? 0,
    losses: entry.losses ?? 0,
  };
}

export async function chzzkTierRefreshRoute(app: FastifyInstance) {
  app.post('/api/chzzk/tier-refresh', { schema: refreshSchema }, async (request, reply) => {
    const { chzzkChannelId, gameType, region, currentTier, currentRank, currentLP, liveId } =
      request.body as {
        chzzkChannelId: string;
        gameType: 'lol' | 'tft';
        region: string;
        currentTier?: string | null;
        currentRank?: string | null;
        currentLP?: number | null;
        liveId?: string | null;
      };

    if (!await requireSelf(request, reply, chzzkChannelId)) return;

    // 서버 사이드 rate limit (5분)
    const remainingSecs = checkRateLimit(chzzkChannelId, gameType);
    if (remainingSecs > 0) {
      return reply.status(429).send({ error: 'Too many requests', retryAfter: remainingSecs });
    }

    // tier_cache에서 puuid + 메타 조회
    const { data: cacheRow, error: cacheError } = await getSupabase()
      .from('tier_cache')
      .select('riot_puuid, riot_game_name, riot_tag_line, is_public')
      .eq('chzzk_channel_id', chzzkChannelId)
      .eq('game_type', gameType)
      .single();

    if (cacheError || !cacheRow) {
      return reply.status(404).send({ error: 'No registered account found for this game type' });
    }

    // Riot API 최신 티어 조회
    let fresh;
    try {
      fresh = await fetchFreshTier(cacheRow.riot_puuid, region, gameType);
    } catch (err: any) {
      const status = err.response?.status || 500;
      return reply.status(status).send({ error: 'Failed to fetch tier from Riot API', details: err.message });
    }

    if (!fresh) {
      return reply.status(500).send({ error: 'Failed to parse Riot API response' });
    }

    // 클라이언트가 보유한 현재값과 비교
    const changed =
      fresh.tier !== (currentTier ?? null) ||
      fresh.rank !== (currentRank ?? null) ||
      fresh.leaguePoints !== (currentLP ?? 0);

    if (changed) {
      const { data: user } = await getSupabase()
        .from('users')
        .select('chzzk_channel_name')
        .eq('chzzk_channel_id', chzzkChannelId)
        .single();

      const { error: updateError } = await getSupabase()
        .from('tier_cache')
        .update({
          tier: fresh.tier,
          rank: fresh.rank,
          league_points: fresh.leaguePoints,
          wins: fresh.wins,
          losses: fresh.losses,
          cached_at: new Date().toISOString(),
        })
        .eq('chzzk_channel_id', chzzkChannelId)
        .eq('game_type', gameType);

      if (updateError) return reply.status(500).send({ error: updateError.message });

      invalidateTierCache(user?.chzzk_channel_name);

      if (liveId) {
        await broadcastToChannel(liveId, 'tier_updated', {
          chzzkChannelName: user?.chzzk_channel_name ?? null,
          gameType,
          tier: fresh.tier,
          rank: fresh.rank,
          leaguePoints: fresh.leaguePoints,
          isPublic: cacheRow.is_public,
          riotGameName: cacheRow.riot_game_name,
          riotTagLine: cacheRow.riot_tag_line,
        });
      }
    }

    markRefreshed(chzzkChannelId, gameType);

    return reply.send({
      changed,
      entry: {
        tier: fresh.tier,
        rank: fresh.rank,
        lp: fresh.leaguePoints,
        wins: fresh.wins,
        losses: fresh.losses,
      },
    });
  });
}
