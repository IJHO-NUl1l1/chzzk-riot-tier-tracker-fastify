import { FastifyInstance } from 'fastify';
import { getSupabase } from '../../lib/supabase';

export async function chzzkUserRoute(app: FastifyInstance) {
  app.get('/api/chzzk/user', async (request, reply) => {
    const { channelName } = request.query as { channelName?: string };

    if (!channelName) {
      return reply.status(400).send({ error: 'channelName parameter is required' });
    }

    const { data: user, error: userError } = await getSupabase()
      .from('users')
      .select('id, chzzk_channel_id, chzzk_channel_name, riot_puuid, created_at, updated_at')
      .eq('chzzk_channel_name', channelName)
      .single();

    if (userError || !user) {
      return reply.status(404).send({ error: 'User not found', channelName });
    }

    const { data: token } = await getSupabase()
      .from('chzzk_tokens')
      .select('expires_at, updated_at')
      .eq('user_id', user.id)
      .single();

    const tokenStatus = token
      ? { hasToken: true, expiresAt: token.expires_at, isExpired: new Date(token.expires_at) < new Date(), lastUpdated: token.updated_at }
      : { hasToken: false };

    return reply.send({ user, chzzkToken: tokenStatus });
  });
}
