import { FastifyInstance } from 'fastify';
import axios from 'axios';
import { getRoutingValue } from '../../lib/riot-api';

export async function riotMatchRoute(app: FastifyInstance) {
  // Match history
  app.get('/api/riot/match/:region/history/:puuid', async (request, reply) => {
    const { region, puuid } = request.params as { region: string; puuid: string };
    const { count = '20', start = '0', queue, type } = request.query as {
      count?: string; start?: string; queue?: string; type?: string;
    };

    if (!region || !puuid) return reply.status(400).send({ error: 'Missing required parameters' });

    const apiKey = process.env.RIOT_LOL_API_KEY;
    if (!apiKey) return reply.status(500).send({ error: 'No API key available' });

    try {
      const routing = getRoutingValue(region.toLowerCase());
      const params = new URLSearchParams({ start, count });
      if (queue) params.append('queue', queue);
      if (type) params.append('type', type);

      const url = `https://${routing}.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?${params.toString()}`;
      const response = await axios.get(url, { headers: { 'X-Riot-Token': apiKey } });
      return reply.send(response.data);
    } catch (err: any) {
      const status = err.response?.status || 500;
      return reply.status(status).send({ error: err.message, details: err.response?.data });
    }
  });

  // Match detail
  app.get('/api/riot/match/:region/:matchId', async (request, reply) => {
    const { region, matchId } = request.params as { region: string; matchId: string };

    const apiKey = process.env.RIOT_LOL_API_KEY;
    if (!apiKey) return reply.status(500).send({ error: 'No API key available' });

    try {
      const routing = getRoutingValue(region.toLowerCase());
      const url = `https://${routing}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(matchId)}`;
      const response = await axios.get(url, { headers: { 'X-Riot-Token': apiKey } });
      return reply.send(response.data);
    } catch (err: any) {
      const status = err.response?.status || 500;
      return reply.status(status).send({ error: err.message, details: err.response?.data });
    }
  });
}
