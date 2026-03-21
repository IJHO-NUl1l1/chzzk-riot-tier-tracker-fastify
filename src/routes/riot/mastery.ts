import { FastifyInstance } from 'fastify';
import axios from 'axios';
import { getRegionHost } from '../../lib/riot-api';

export async function riotMasteryRoute(app: FastifyInstance) {
  app.get('/api/riot/mastery/:region/:puuid', async (request, reply) => {
    const { region, puuid } = request.params as { region: string; puuid: string };

    const regionHost = getRegionHost(region.toLowerCase());
    if (!regionHost) return reply.status(400).send({ error: 'Invalid region' });

    const apiKey = process.env.RIOT_LOL_API_KEY;
    if (!apiKey) return reply.status(500).send({ error: 'No API key available' });

    try {
      const url = `https://${regionHost}/lol/champion-mastery/v4/champion-masteries/by-puuid/${encodeURIComponent(puuid)}/top`;
      const response = await axios.get(url, { headers: { 'X-Riot-Token': apiKey } });
      return reply.send(response.data);
    } catch (err: any) {
      const status = err.response?.status || 500;
      return reply.status(status).send({ error: err.message, details: err.response?.data });
    }
  });
}
