import { FastifyInstance } from 'fastify';
import axios from 'axios';
import { getRoutingValue } from '../../lib/riot-api';

export async function riotAccountRoute(app: FastifyInstance) {
  app.get('/api/riot/account/by-riot-id/:gameName/:tagLine', async (request, reply) => {
    const { gameName, tagLine } = request.params as { gameName: string; tagLine: string };
    const { region = 'kr' } = request.query as { region?: string };

    const decodedGameName = decodeURIComponent(gameName);
    const decodedTagLine = decodeURIComponent(tagLine);

    if (!decodedGameName || !decodedTagLine) {
      return reply.status(400).send({ error: 'Missing required parameters' });
    }

    const apiKey = process.env.RIOT_LOL_API_KEY;
    if (!apiKey) return reply.status(500).send({ error: 'No API key available' });

    try {
      const routing = getRoutingValue(region);
      const url = `https://${routing}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(decodedGameName)}/${encodeURIComponent(decodedTagLine)}`;
      const response = await axios.get(url, { headers: { 'X-Riot-Token': apiKey } });
      return reply.send(response.data);
    } catch (err: any) {
      const status = err.response?.status || 500;
      return reply.status(status).send({ error: err.message, details: err.response?.data });
    }
  });
}
