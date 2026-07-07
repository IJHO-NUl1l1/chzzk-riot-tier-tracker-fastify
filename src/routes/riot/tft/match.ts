import { FastifyInstance } from 'fastify';
import axios from 'axios';
import { getRoutingValue } from '../../../lib/riot-api';

// riot/match.ts와 동일: 'integer' 선언으로 문자열 쿼리를 숫자로 자동 변환하고
// 비정상 값은 400 처리.
const historyQuerySchema = {
  querystring: {
    type: 'object',
    properties: {
      count: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      start: { type: 'integer', minimum: 0, default: 0 },
    },
  },
};

export async function tftMatchRoute(app: FastifyInstance) {
  app.get('/api/riot/tft/match/:region/history/:puuid', { schema: historyQuerySchema }, async (request, reply) => {
    const { region, puuid } = request.params as { region: string; puuid: string };
    const { count, start } = request.query as { count: number; start: number };

    const apiKey = process.env.RIOT_TFT_API_KEY || process.env.RIOT_LOL_API_KEY;
    if (!apiKey) return reply.status(500).send({ error: 'No API key available' });

    try {
      const routing = getRoutingValue(region.toLowerCase());
      const params = new URLSearchParams({ start: String(start), count: String(count) });
      const url = `https://${routing}.api.riotgames.com/tft/match/v1/matches/by-puuid/${encodeURIComponent(puuid)}/ids?${params.toString()}`;
      const response = await axios.get(url, { headers: { 'X-Riot-Token': apiKey } });
      return reply.send(response.data);
    } catch (err: any) {
      const status = err.response?.status || 500;
      return reply.status(status).send({ error: err.message, details: err.response?.data });
    }
  });

  app.get('/api/riot/tft/match/:region/:matchId', async (request, reply) => {
    const { region, matchId } = request.params as { region: string; matchId: string };

    const apiKey = process.env.RIOT_TFT_API_KEY || process.env.RIOT_LOL_API_KEY;
    if (!apiKey) return reply.status(500).send({ error: 'No API key available' });

    try {
      const routing = getRoutingValue(region.toLowerCase());
      const url = `https://${routing}.api.riotgames.com/tft/match/v1/matches/${encodeURIComponent(matchId)}`;
      const response = await axios.get(url, { headers: { 'X-Riot-Token': apiKey } });
      return reply.send(response.data);
    } catch (err: any) {
      const status = err.response?.status || 500;
      return reply.status(status).send({ error: err.message, details: err.response?.data });
    }
  });
}
