import { FastifyInstance } from 'fastify';

export async function chzzkChatChannelRoute(app: FastifyInstance) {
  app.get('/api/chzzk/chat-channel', async (request, reply) => {
    const { channelId } = request.query as { channelId?: string };

    if (!channelId) {
      return reply.status(400).send({ error: 'channelId is required' });
    }

    try {
      const res = await fetch(
        `https://api.chzzk.naver.com/service/v3/channels/${encodeURIComponent(channelId)}/live-detail`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
            'Accept': 'application/json',
            'Referer': 'https://chzzk.naver.com/',
          },
        }
      );

      if (!res.ok) {
        return reply.status(res.status).send({ error: 'Failed to fetch live detail' });
      }

      const data = await res.json() as any;
      const chatChannelId = data?.content?.chatChannelId;
      const status = data?.content?.status;

      if (!chatChannelId) {
        return reply.status(404).send({ error: 'chatChannelId not found' });
      }

      return reply.send({ chatChannelId, status });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
}
