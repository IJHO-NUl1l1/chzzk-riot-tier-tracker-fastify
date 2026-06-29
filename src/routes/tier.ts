import { FastifyInstance } from 'fastify';
import { getSupabase } from '../lib/supabase';
import { getTierCache, setTierCache, TierEntry } from '../lib/tier-store';

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
  app.get('/api/tier', async (request, reply) => {
    const { chzzk_name } = request.query as { chzzk_name?: string };

    if (!chzzk_name) {
      return reply.status(400).send({ error: 'chzzk_name parameter is required' });
    }

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
