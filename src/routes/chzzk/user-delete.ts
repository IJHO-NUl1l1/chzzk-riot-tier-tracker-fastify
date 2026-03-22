import { FastifyInstance } from 'fastify';
import { getSupabase } from '../../lib/supabase';
import { requireSelf } from '../../lib/auth';

export async function chzzkUserDeleteRoute(app: FastifyInstance) {
  app.delete('/api/chzzk/user/delete', async (request, reply) => {
    const { userId, chzzkChannelId } = request.body as { userId?: string; chzzkChannelId?: string };

    if (!userId) return reply.status(400).send({ error: 'userId is required' });
    if (!chzzkChannelId) return reply.status(400).send({ error: 'chzzkChannelId is required' });
    if (!await requireSelf(request, reply, chzzkChannelId)) return;

    const clientId = process.env.CHZZK_CLIENT_ID;
    const clientSecret = process.env.CHZZK_CLIENT_SECRET;

    if (clientId && clientSecret) {
      const { data: tokenRecord } = await getSupabase()
        .from('chzzk_tokens')
        .select('access_token')
        .eq('user_id', userId)
        .single();

      if (tokenRecord?.access_token) {
        await fetch('https://openapi.chzzk.naver.com/auth/v1/token/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId, clientSecret, token: tokenRecord.access_token }),
        }).catch(() => {});
      }
    }

    await getSupabase().from('chzzk_tokens').delete().eq('user_id', userId);
    await getSupabase().from('riot_tokens').delete().eq('user_id', userId);
    await getSupabase().from('tier_cache').delete().eq('user_id', userId);

    const { error: deleteError } = await getSupabase()
      .from('users')
      .delete()
      .eq('id', userId);

    if (deleteError) {
      return reply.status(500).send({ error: 'Failed to delete user', details: deleteError.message });
    }

    return reply.send({ message: 'User deleted successfully' });
  });
}
