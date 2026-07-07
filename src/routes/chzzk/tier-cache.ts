import { FastifyInstance } from 'fastify';
import { getSupabase } from '../../lib/supabase';
import { requireSelf } from '../../lib/auth';
import { broadcastToChannel } from '../../lib/realtime';
import { invalidateTierCache } from '../../lib/tier-store';
import { errorResponse, gameTypeSchema, nonEmptyString, nullableString } from '../../schemas/common';

const getSchema = {
  querystring: {
    type: 'object',
    properties: { chzzkChannelId: nonEmptyString },
    required: ['chzzkChannelId'],
  },
  response: {
    200: {
      type: 'object',
      properties: {
        linked: { type: 'boolean' },
        entries: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              game_type: { type: 'string' },
              tier: nullableString,
              rank: nullableString,
              league_points: { type: 'number' },
              riot_puuid: { type: 'string' },
              riot_game_name: nullableString,
              riot_tag_line: nullableString,
              is_public: { type: 'boolean' },
              is_verified: { type: 'boolean' },
              cached_at: nullableString,
            },
          },
        },
      },
    },
    500: errorResponse,
  },
};

// entries 항목의 구조 검증. 이전에는 `entries?: any[]` 캐스팅 후 루프 안에서
// 항목별로 수동 검사했지만, 스키마 위반 항목이 하나라도 있으면 이제 요청
// 전체가 400으로 거부된다(호출자는 우리 익스텐션뿐이라 항상 유효한 항목을
// 보낸다). queueType은 game_type에서 1:1로 유도되는 값이라 컬럼과 함께 제거.
const postSchema = {
  body: {
    type: 'object',
    properties: {
      chzzkChannelId: nonEmptyString,
      liveId: { type: 'string' },
      entries: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          properties: {
            riotPuuid: nonEmptyString,
            gameType: gameTypeSchema,
            tier: nullableString,
            rank: nullableString,
            leaguePoints: { type: 'number' },
            wins: { type: 'number' },
            losses: { type: 'number' },
            gameName: nullableString,
            tagLine: nullableString,
            isPublic: { type: 'boolean' },
            isVerified: { type: 'boolean' },
          },
          required: ['riotPuuid', 'gameType'],
        },
      },
    },
    required: ['chzzkChannelId', 'entries'],
  },
};

const deleteSchema = {
  querystring: {
    type: 'object',
    properties: {
      chzzkChannelId: nonEmptyString,
      gameType: gameTypeSchema,
      liveId: { type: 'string' },
    },
    required: ['chzzkChannelId'],
  },
};

interface TierCacheEntry {
  riotPuuid: string;
  gameType: 'lol' | 'tft';
  tier?: string | null;
  rank?: string | null;
  leaguePoints?: number;
  wins?: number;
  losses?: number;
  gameName?: string | null;
  tagLine?: string | null;
  isPublic?: boolean;
  isVerified?: boolean;
}

export async function chzzkTierCacheRoute(app: FastifyInstance) {
  app.get('/api/chzzk/tier-cache', { schema: getSchema }, async (request, reply) => {
    const { chzzkChannelId } = request.query as { chzzkChannelId: string };

    const { data, error } = await getSupabase()
      .from('tier_cache')
      .select('game_type, tier, rank, league_points, riot_puuid, riot_game_name, riot_tag_line, is_public, is_verified, cached_at')
      .eq('chzzk_channel_id', chzzkChannelId);

    if (error) {
      return reply.status(500).send({ error: error.message });
    }

    return reply.send({ linked: data.length > 0, entries: data });
  });

  app.post('/api/chzzk/tier-cache', { schema: postSchema }, async (request, reply) => {
    const { chzzkChannelId, entries, liveId } =
      request.body as { chzzkChannelId: string; entries: TierCacheEntry[]; liveId?: string };

    if (!await requireSelf(request, reply, chzzkChannelId)) return;

    const { data: user, error: userError } = await getSupabase()
      .from('users')
      .select('id, chzzk_channel_id, chzzk_channel_name')
      .eq('chzzk_channel_id', chzzkChannelId)
      .single();

    if (userError || !user) {
      return reply.status(404).send({ error: 'User not found', chzzkChannelId });
    }

    const results = [];

    for (const entry of entries) {
      const { riotPuuid, gameType, tier, rank, leaguePoints, wins, losses, gameName, tagLine, isPublic, isVerified } = entry;

      const { data, error } = await getSupabase()
        .from('tier_cache')
        .upsert(
          {
            chzzk_channel_id: chzzkChannelId,
            riot_puuid: riotPuuid,
            game_type: gameType,
            tier: tier ?? null,
            rank: rank ?? null,
            league_points: leaguePoints ?? 0,
            wins: wins ?? 0,
            losses: losses ?? 0,
            riot_game_name: gameName ?? null,
            riot_tag_line: tagLine ?? null,
            is_public: isPublic ?? true,
            is_verified: isVerified ?? false,
            cached_at: new Date().toISOString(),
          },
          { onConflict: 'chzzk_channel_id,game_type' }
        )
        .select()
        .single();

      if (error) {
        results.push({ gameType, error: error.message });
      } else {
        results.push({ gameType, success: true, data });
        invalidateTierCache(user.chzzk_channel_name);
        if (liveId) {
          await broadcastToChannel(liveId, 'tier_updated', {
            chzzkChannelName: user.chzzk_channel_name,
            gameType,
            tier: tier ?? null,
            rank: rank ?? null,
            leaguePoints: leaguePoints ?? 0,
            isPublic: isPublic ?? true,
            riotGameName: gameName ?? null,
            riotTagLine: tagLine ?? null,
          });
        }
      }
    }

    return reply.send({ results });
  });

  app.delete('/api/chzzk/tier-cache', { schema: deleteSchema }, async (request, reply) => {
    const { chzzkChannelId, gameType, liveId } =
      request.query as { chzzkChannelId: string; gameType?: 'lol' | 'tft'; liveId?: string };

    if (!await requireSelf(request, reply, chzzkChannelId)) return;

    const { data: user } = await getSupabase()
      .from('users')
      .select('chzzk_channel_name')
      .eq('chzzk_channel_id', chzzkChannelId)
      .single();

    let query = getSupabase()
      .from('tier_cache')
      .delete()
      .eq('chzzk_channel_id', chzzkChannelId);

    if (gameType) {
      query = query.eq('game_type', gameType);
    }

    const { error } = await query;

    if (error) {
      return reply.status(500).send({ error: error.message });
    }

    invalidateTierCache(user?.chzzk_channel_name);
    if (liveId) {
      await broadcastToChannel(liveId, 'tier_deleted', {
        chzzkChannelName: user?.chzzk_channel_name ?? null,
        gameType: gameType ?? null,
      });
    }

    return reply.send({ success: true });
  });
}
