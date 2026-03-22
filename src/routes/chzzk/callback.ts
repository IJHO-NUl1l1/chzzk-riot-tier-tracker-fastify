import { FastifyInstance } from 'fastify';
import { getSupabase } from '../../lib/supabase';
import { generateChzzkJwt } from '../../lib/jwt';

export async function chzzkCallbackRoute(app: FastifyInstance) {
  app.get('/api/chzzk/auth/callback', async (request, reply) => {
    const { code, state } = request.query as { code?: string; state?: string };

    if (!code || !state) {
      return reply.status(400).send({ error: 'Missing code or state parameter' });
    }

    const clientId = process.env.CHZZK_CLIENT_ID;
    const clientSecret = process.env.CHZZK_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return reply.status(500).send({ error: 'Chzzk OAuth not configured' });
    }

    // CSRF check
    const storedState = request.cookies['chzzk_oauth_state'];
    if (!storedState || storedState !== state) {
      return reply.status(403).send({ error: 'Invalid state parameter (CSRF check failed)' });
    }

    try {
      // 1. Token exchange
      const tokenResponse = await fetch('https://openapi.chzzk.naver.com/auth/v1/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grantType: 'authorization_code', clientId, clientSecret, code, state }),
      });
      const tokenData = await tokenResponse.json() as any;

      if (!tokenResponse.ok) {
        return reply.status(tokenResponse.status).send({ error: 'Token exchange failed', details: tokenData });
      }

      const { accessToken, refreshToken, expiresIn } = tokenData.content || tokenData;

      if (!accessToken || !refreshToken) {
        return reply.status(502).send({ error: 'Invalid token response from Chzzk', rawResponse: tokenData });
      }

      // 2. User info
      const userResponse = await fetch('https://openapi.chzzk.naver.com/open/v1/users/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const userData = await userResponse.json() as any;

      if (!userResponse.ok || !userData.content) {
        return reply.status(502).send({ error: 'Failed to fetch Chzzk user info', details: userData });
      }

      const { channelId, channelName } = userData.content;

      if (!channelId) {
        return reply.status(502).send({ error: 'Missing channelId in user info' });
      }

      // 3. UPSERT user
      const { data: user, error: userError } = await getSupabase()
        .from('users')
        .upsert(
          { chzzk_channel_id: channelId, chzzk_channel_name: channelName || null, updated_at: new Date().toISOString() },
          { onConflict: 'chzzk_channel_id' }
        )
        .select('id')
        .single();

      if (userError || !user) {
        return reply.status(500).send({ error: 'Failed to save user', details: userError?.message });
      }

      // 4. UPSERT tokens
      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
      const { error: tokenError } = await getSupabase()
        .from('chzzk_tokens')
        .upsert(
          { user_id: user.id, access_token: accessToken, refresh_token: refreshToken, expires_at: expiresAt, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        );

      if (tokenError) {
        return reply.status(500).send({ error: 'Failed to save tokens', details: tokenError.message });
      }

      // 5. JWT 발급 (치지직 access_token과 동일한 만료시간)
      const jwtToken = generateChzzkJwt(channelId, channelName || '', `${expiresIn}s`);

      // 6. Redirect
      const basePath = request.cookies['chzzk_oauth_redirect'] || '/auth/success';
      const serverUrl = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3000}`;
      const redirectUrl = new URL(basePath.startsWith('http') ? basePath : serverUrl + basePath);
      redirectUrl.searchParams.set('channelId', channelId);
      redirectUrl.searchParams.set('channelName', channelName || '');
      redirectUrl.searchParams.set('userId', String(user.id));
      redirectUrl.searchParams.set('jwt_token', jwtToken);

      reply.clearCookie('chzzk_oauth_state');
      reply.clearCookie('chzzk_oauth_redirect');
      return reply.redirect(redirectUrl.toString());

    } catch (error: any) {
      return reply.status(500).send({ error: 'Chzzk OAuth callback failed', message: error.message });
    }
  });
}
