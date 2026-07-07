import { FastifyInstance } from 'fastify';
import { getSupabase } from '../lib/supabase';
import { getTierCache, setTierCache, TierEntry } from '../lib/tier-store';
import { errorResponse, nonEmptyString, nullableString } from '../schemas/common';

// 채팅 닉네임마다 호출되는 최다 트래픽 엔드포인트라 response 스키마의
// 직렬화 최적화(fast-json-stringify) 효과가 가장 크다. 응답에 필드를
// 추가할 때는 여기 response 스키마에도 함께 추가해야 한다.
const tierSchema = {
  querystring: {
    type: 'object',
    properties: {
      chzzk_name: nonEmptyString,
    },
    required: ['chzzk_name'],
  },
  response: {
    200: {
      type: 'object',
      properties: {
        entries: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              game_type: { type: 'string' },
              tier: nullableString,
              rank: nullableString,
              league_points: { type: 'number' },
              riot_game_name: nullableString,
              riot_tag_line: nullableString,
            },
          },
        },
      },
    },
    500: errorResponse,
  },
};

const inFlight = new Map<string, Promise<TierEntry[]>>();

async function fetchFromDB(chzzk_name: string): Promise<TierEntry[]> {
  const { data: user, error: userError } = await getSupabase()
    .from('users')
    .select('chzzk_channel_id')
    .eq('chzzk_channel_name', chzzk_name)
    .single();

  if (userError || !user) {
    setTierCache(chzzk_name, []);
    return [];
  }

  const { data, error } = await getSupabase()
    .from('tier_cache')
    .select('game_type, tier, rank, league_points, riot_game_name, riot_tag_line')
    .eq('chzzk_channel_id', user.chzzk_channel_id)
    .eq('is_public', true);

  if (error) throw new Error(error.message);

  setTierCache(chzzk_name, data);
  return data;
}

export async function tierRoute(app: FastifyInstance) {
  app.get('/api/tier', { schema: tierSchema }, async (request, reply) => {
    // 스키마가 required를 보장하므로 누락 검사 불필요
    const { chzzk_name } = request.query as { chzzk_name: string };

    const cached = getTierCache(chzzk_name);
    if (cached) {
      return reply.send({ entries: cached });
    }

    const key = chzzk_name.toLowerCase();
    if (!inFlight.has(key)) {
      const promise = fetchFromDB(chzzk_name).finally(() => inFlight.delete(key));
      inFlight.set(key, promise);
    }

    try {
      const entries = await inFlight.get(key)!;
      return reply.send({ entries });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return reply.status(500).send({ error: message });
    }
  });
}
