import { FastifyInstance } from 'fastify';
import { getSupabase } from '../../lib/supabase';
import { requireSelf } from '../../lib/auth';
import { broadcastToChannel } from '../../lib/realtime';

export async function chzzkPrivacyRoute(app: FastifyInstance) {
  app.post('/api/privacy/update', async (request, reply) => {
    const body = request.body as { chzzkChannelId?: string; gameType?: string; isPublic?: boolean };
    const { chzzkChannelId, gameType, isPublic } = body;

    if (!chzzkChannelId) {
      return reply.status(400).send({ error: 'chzzkChannelId is required' });
    }
    if (isPublic === undefined || isPublic === null) {
      return reply.status(400).send({ error: 'isPublic is required' });
    }
    if (gameType && !['lol', 'tft'].includes(gameType)) {
      return reply.status(400).send({ error: 'gameType must be "lol" or "tft"' });
    }

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

    await broadcastToChannel(chzzkChannelId, 'privacy_changed', {
      chzzkChannelName: user?.chzzk_channel_name ?? null,
      gameType: gameType ?? null,
      isPublic,
    });

    return reply.send({ success: true });
  });
}
