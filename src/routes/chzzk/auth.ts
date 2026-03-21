import { FastifyInstance } from 'fastify';
import crypto from 'crypto';

export async function chzzkAuthRoute(app: FastifyInstance) {
  app.get('/api/chzzk/auth', async (request, reply) => {
    const clientId = process.env.CHZZK_CLIENT_ID;

    if (!clientId) {
      return reply.status(500).send({ error: 'Chzzk OAuth not configured' });
    }

    const state = crypto.randomBytes(16).toString('hex');
    const { redirect } = request.query as { redirect?: string };

    const redirectUri = process.env.CHZZK_REDIRECT_URI
      || `${process.env.SERVER_URL}/api/chzzk/auth/callback`;

    const authUrl = new URL('https://chzzk.naver.com/account-interlock');
    authUrl.searchParams.set('clientId', clientId);
    authUrl.searchParams.set('redirectUri', redirectUri);
    authUrl.searchParams.set('state', state);

    const isProduction = process.env.NODE_ENV === 'production';

    reply.setCookie('chzzk_oauth_state', state, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 600,
      path: '/',
    });

    if (redirect) {
      reply.setCookie('chzzk_oauth_redirect', redirect, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        maxAge: 600,
        path: '/',
      });
    }

    return reply.redirect(authUrl.toString());
  });
}
