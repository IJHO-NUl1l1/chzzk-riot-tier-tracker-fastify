import { FastifyInstance } from 'fastify';
import { getSupabase } from '../../lib/supabase';
import { requireSelf } from '../../lib/auth';

export async function chzzkRevokeRoute(app: FastifyInstance) {
  app.post('/api/chzzk/auth/revoke', async (request, reply) => {
    const { userId, chzzkChannelId } = request.body as { userId?: string; chzzkChannelId?: string };

    if (!userId) return reply.status(400).send({ error: 'userId is required' });
    if (!chzzkChannelId) return reply.status(400).send({ error: 'chzzkChannelId is required' });
    if (!await requireSelf(request, reply, chzzkChannelId)) return;

    const clientId = process.env.CHZZK_CLIENT_ID;
    const clientSecret = process.env.CHZZK_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return reply.status(500).send({ error: 'Chzzk OAuth not configured' });
    }

    const { data: tokenRecord, error: fetchError } = await getSupabase()
      .from('chzzk_tokens')
      .select('access_token')
      .eq('user_id', userId)
      .single();

    if (fetchError || !tokenRecord) {
      return reply.status(404).send({ error: 'No token found for user' });
    }

    const revokeResponse = await fetch('https://openapi.chzzk.naver.com/auth/v1/token/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, clientSecret, token: tokenRecord.access_token }),
    });

    const revokeData = await revokeResponse.json().catch(() => null);

    const { error: deleteError } = await getSupabase()
      .from('chzzk_tokens')
      .delete()
      .eq('user_id', userId);

    if (deleteError) {
      return reply.status(500).send({ error: 'Failed to delete token from DB', details: deleteError.message });
    }

    return reply.send({
      message: 'Token revoked and deleted',
      chzzkRevoke: revokeResponse.ok ? 'success' : 'failed',
      chzzkRevokeStatus: revokeResponse.status,
      chzzkRevokeDetail: revokeData,
    });
  });
}
