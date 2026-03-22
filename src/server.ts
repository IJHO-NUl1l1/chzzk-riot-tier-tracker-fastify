import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';

import { tierRoute } from './routes/tier';
import { chzzkAuthRoute } from './routes/chzzk/auth';
import { chzzkCallbackRoute } from './routes/chzzk/callback';
import { chzzkRefreshRoute } from './routes/chzzk/refresh';
import { chzzkRevokeRoute } from './routes/chzzk/revoke';
import { chzzkUserRoute } from './routes/chzzk/user';
import { chzzkUserDeleteRoute } from './routes/chzzk/user-delete';
import { chzzkTierCacheRoute } from './routes/chzzk/tier-cache';
import { riotAccountRoute } from './routes/riot/account';
import { riotSummonerRoute } from './routes/riot/summoner';
import { riotLeagueRoute } from './routes/riot/league';
import { riotMasteryRoute } from './routes/riot/mastery';
import { riotMatchRoute } from './routes/riot/match';
import { riotSpectatorRoute } from './routes/riot/spectator';
import { tftAccountRoute } from './routes/riot/tft/account';
import { tftSummonerRoute } from './routes/riot/tft/summoner';
import { tftLeagueRoute } from './routes/riot/tft/league';
import { tftMatchRoute } from './routes/riot/tft/match';
import { tftSpectatorRoute } from './routes/riot/tft/spectator';

const app = Fastify({ logger: true });

app.register(cors, {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // same-origin or server-to-server
    const allowed = [
      /^chrome-extension:\/\//,
      /^https:\/\/chzzk\.naver\.com/,
      /^http:\/\/localhost/,
    ];
    if (allowed.some((r) => r.test(origin))) {
      cb(null, true);
    } else {
      cb(new Error('Not allowed by CORS'), false);
    }
  },
  credentials: true,
});

app.register(cookie);

app.register(tierRoute);
app.register(chzzkAuthRoute);
app.register(chzzkCallbackRoute);
app.register(chzzkRefreshRoute);
app.register(chzzkRevokeRoute);
app.register(chzzkUserRoute);
app.register(chzzkUserDeleteRoute);
app.register(chzzkTierCacheRoute);
app.register(riotAccountRoute);
app.register(riotSummonerRoute);
app.register(riotLeagueRoute);
app.register(riotMasteryRoute);
app.register(riotMatchRoute);
app.register(riotSpectatorRoute);
app.register(tftAccountRoute);
app.register(tftSummonerRoute);
app.register(tftLeagueRoute);
app.register(tftMatchRoute);
app.register(tftSpectatorRoute);

app.get('/riot.txt', (_, reply) => {
  reply.type('text/plain').send('cc7a7eb0-0f17-48d6-9f9e-da368c70dffb');
});

const PORT = Number(process.env.PORT) || 3000;

app.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
});
