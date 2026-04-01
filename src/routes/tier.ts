import { FastifyInstance } from 'fastify';
import { getSupabase } from '../lib/supabase';
import { getTierCache, setTierCache } from '../lib/tier-store';

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

    const { data: user, error: userError } = await getSupabase()
      .from('users')
      .select('chzzk_channel_id')
      .eq('chzzk_channel_name', chzzk_name)
      .single();

    if (userError || !user) {
      return reply.send({ entries: [] });
    }

    const { data, error } = await getSupabase()
      .from('tier_cache')
      .select('game_type, tier, rank, league_points, riot_game_name, riot_tag_line')
      .eq('chzzk_channel_id', user.chzzk_channel_id)
      .eq('is_public', true);

    if (error) {
      return reply.status(500).send({ error: error.message });
    }

    setTierCache(chzzk_name, data);
    return reply.send({ entries: data });
  });
}
