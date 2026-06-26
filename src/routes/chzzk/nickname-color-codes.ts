import { FastifyInstance } from 'fastify';

let cachedCodeList: any[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1시간

export async function chzzkNicknameColorCodesRoute(app: FastifyInstance) {
  app.get('/api/chzzk/nickname-color-codes', async (_request, reply) => {
    if (cachedCodeList && Date.now() - cacheTime < CACHE_TTL) {
      return reply.send({ codeList: cachedCodeList });
    }

    try {
      const res = await fetch(
        'https://api.chzzk.naver.com/service/v2/nickname/color/codes',
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
            'Accept': 'application/json',
            'Referer': 'https://chzzk.naver.com/',
          },
        }
      );

      if (!res.ok) return reply.status(res.status).send({ error: 'Failed to fetch color codes' });

      const data = await res.json() as any;
      cachedCodeList = data?.content?.codeList ?? [];
      cacheTime = Date.now();
      return reply.send({ codeList: cachedCodeList });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
}
