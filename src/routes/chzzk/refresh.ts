import { FastifyInstance } from 'fastify';
import { getSupabase } from '../../lib/supabase';
import { requireSelf } from '../../lib/auth';
import { generateChzzkJwt } from '../../lib/jwt';

export async function chzzkRefreshRoute(app: FastifyInstance) {
  app.post('/api/chzzk/auth/refresh', async (request, reply) => {
    const { userId, chzzkChannelId } = request.body as { userId?: string; chzzkChannelId?: string };

    if (!userId) {
      return reply.status(400).send({ error: 'userId is required' });
    }

    if (chzzkChannelId && !await requireSelf(request, reply, chzzkChannelId)) return;

    const clientId = process.env.CHZZK_CLIENT_ID;
    const clientSecret = process.env.CHZZK_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return reply.status(500).send({ error: 'Chzzk OAuth not configured' });
    }

    const { data: tokenRecord, error: fetchError } = await getSupabase()
      .from('chzzk_tokens')
      .select('refresh_token, expires_at')
      .eq('user_id', userId)
      .single();

    if (fetchError || !tokenRecord) {
      return reply.status(404).send({ error: 'No token found for user' });
    }

    const tokenResponse = await fetch('https://openapi.chzzk.naver.com/auth/v1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grantType: 'refresh_token',
        clientId,
        clientSecret,
        refreshToken: tokenRecord.refresh_token,
      }),
    });

    const tokenData = await tokenResponse.json() as any;

    if (!tokenResponse.ok) {
      return reply.status(tokenResponse.status).send({ error: 'Token refresh failed', details: tokenData });
    }

    const { accessToken, refreshToken, expiresIn } = tokenData.content || tokenData;

    if (!accessToken || !refreshToken) {
      return reply.status(502).send({ error: 'Invalid refresh response from Chzzk', rawResponse: tokenData });
    }

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    const { error: updateError } = await getSupabase()
      .from('chzzk_tokens')
      .update({ access_token: accessToken, refresh_token: refreshToken, expires_at: expiresAt, updated_at: new Date().toISOString() })
      .eq('user_id', userId);

    if (updateError) {
      return reply.status(500).send({ error: 'Failed to update tokens', details: updateError.message });
    }

    let newJwtToken: string | undefined;
    if (chzzkChannelId) {
      const { data: userRecord } = await getSupabase()
        .from('users')
        .select('chzzk_channel_name')
        .eq('chzzk_channel_id', chzzkChannelId)
        .single();
      newJwtToken = generateChzzkJwt(chzzkChannelId, userRecord?.chzzk_channel_name || '', `${expiresIn}s`);
    }

    return reply.send({ message: 'Token refreshed successfully', expiresAt, jwt_token: newJwtToken });
  });
}
