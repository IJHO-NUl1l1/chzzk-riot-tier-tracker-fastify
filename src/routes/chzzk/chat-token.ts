import { FastifyInstance } from 'fastify';
import { nonEmptyString } from '../../schemas/common';

const chatTokenSchema = {
  querystring: {
    type: 'object',
    properties: { chatChannelId: nonEmptyString },
    required: ['chatChannelId'],
  },
};

export async function chzzkChatTokenRoute(app: FastifyInstance) {
  app.get('/api/chzzk/chat-token', { schema: chatTokenSchema }, async (request, reply) => {
    const { chatChannelId } = request.query as { chatChannelId: string };

    try {
      const res = await fetch(
        `https://comm-api.game.naver.com/nng_main/v1/chats/access-token?channelId=${encodeURIComponent(chatChannelId)}&chatType=STREAMING`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
            'Accept': 'application/json',
            'Referer': 'https://chzzk.naver.com/',
          },
        }
      );

      if (!res.ok) {
        return reply.status(res.status).send({ error: 'Failed to fetch access token' });
      }

      const data = await res.json() as any;
      const accessToken = data?.content?.accessToken;

      if (!accessToken) {
        return reply.status(404).send({ error: 'accessToken not found' });
      }

      return reply.send({ accessToken });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
}
