import { FastifyInstance } from 'fastify';
import { cachedGet, getRoutingValue } from '../../lib/riot-api';

// 쿼리스트링은 항상 문자열로 오지만 type: 'integer'를 선언하면 Ajv가
// "20" → 20으로 자동 변환(coercion)하고, 숫자가 아닌 값·범위 밖 값은
// 400으로 거부한다. default도 스키마가 채워준다.
const historyQuerySchema = {
  querystring: {
    type: 'object',
    properties: {
      count: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      start: { type: 'integer', minimum: 0, default: 0 },
      queue: { type: 'string' },
      type: { type: 'string' },
    },
  },
};

export async function riotMatchRoute(app: FastifyInstance) {
  app.get('/api/riot/match/:region/history/:puuid', { schema: historyQuerySchema }, async (request, reply) => {
    const { region, puuid } = request.params as { region: string; puuid: string };
    const { count, start, queue, type } = request.query as {
      count: number; start: number; queue?: string; type?: string;
    };

    const apiKey = process.env.RIOT_LOL_API_KEY;
    if (!apiKey) return reply.status(500).send({ error: 'No API key available' });

    try {
      const routing = getRoutingValue(region.toLowerCase());
      const params = new URLSearchParams({ start: String(start), count: String(count) });
      if (queue) params.append('queue', queue);
      if (type) params.append('type', type);

      const url = `https://${routing}.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?${params.toString()}`;
      const data = await cachedGet(url, apiKey);
      return reply.send(data);
    } catch (err: any) {
      const status = err.response?.status || 500;
      return reply.status(status).send({ error: err.message, details: err.response?.data });
    }
  });

  app.get('/api/riot/match/:region/:matchId', async (request, reply) => {
    const { region, matchId } = request.params as { region: string; matchId: string };

    const apiKey = process.env.RIOT_LOL_API_KEY;
    if (!apiKey) return reply.status(500).send({ error: 'No API key available' });

    try {
      const routing = getRoutingValue(region.toLowerCase());
      const url = `https://${routing}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(matchId)}`;
      const data = await cachedGet(url, apiKey);
      return reply.send(data);
    } catch (err: any) {
      const status = err.response?.status || 500;
      return reply.status(status).send({ error: err.message, details: err.response?.data });
    }
  });
}
