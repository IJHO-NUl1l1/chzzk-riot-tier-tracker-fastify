import { FastifyInstance } from 'fastify';
import { getSupabase } from '../../lib/supabase';
import { requireSelf } from '../../lib/auth';
import { broadcastToChannel } from '../../lib/realtime';
import { invalidateTierCache } from '../../lib/tier-store';
import { gameTypeSchema, nonEmptyString } from '../../schemas/common';

// isPublic을 boolean으로 강제한다 — 이전 수동 검증은 문자열 "true"도
// truthy로 통과시켜 DB에 문자열이 저장될 수 있었다.
const updateSchema = {
  body: {
    type: 'object',
    properties: {
      chzzkChannelId: nonEmptyString,
      gameType: gameTypeSchema,
      isPublic: { type: 'boolean' },
      liveId: { type: 'string' },
    },
    required: ['chzzkChannelId', 'isPublic'],
  },
};

export async function chzzkPrivacyRoute(app: FastifyInstance) {
  app.post('/api/privacy/update', { schema: updateSchema }, async (request, reply) => {
    const { chzzkChannelId, gameType, isPublic, liveId } =
      request.body as { chzzkChannelId: string; gameType?: 'lol' | 'tft'; isPublic: boolean; liveId?: string };

    if (!await requireSelf(request, reply, chzzkChannelId)) return;

    const { data: user } = await getSupabase()
      .from('users')
      .select('chzzk_channel_name')
      .eq('chzzk_channel_id', chzzkChannelId)
      .single();

    let query = getSupabase()
      .from('tier_cache')
      .update({ is_public: isPublic })
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
      await broadcastToChannel(liveId, 'privacy_changed', {
        chzzkChannelName: user?.chzzk_channel_name ?? null,
        gameType: gameType ?? null,
        isPublic,
      });
    }

    return reply.send({ success: true });
  });
}
