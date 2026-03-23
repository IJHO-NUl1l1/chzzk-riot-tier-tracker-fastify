import { FastifyInstance } from 'fastify';
import { getSupabase } from '../../lib/supabase';
import { requireSelf } from '../../lib/auth';
import { broadcastToChannel } from '../../lib/realtime';

export async function chzzkTierCacheRoute(app: FastifyInstance) {
  app.get('/api/chzzk/tier-cache', async (request, reply) => {
    const { chzzkChannelId } = request.query as { chzzkChannelId?: string };

    if (!chzzkChannelId) {
      return reply.status(400).send({ error: 'chzzkChannelId parameter is required' });
    }

    const { data, error } = await getSupabase()
      .from('tier_cache')
      .select('game_type, tier, rank, league_points, riot_puuid, riot_game_name, riot_tag_line, is_public, cached_at')
      .eq('chzzk_channel_id', chzzkChannelId);

    if (error) {
      return reply.status(500).send({ error: error.message });
    }

    return reply.send({ linked: data.length > 0, entries: data });
  });

  app.post('/api/chzzk/tier-cache', async (request, reply) => {
    const body = request.body as { chzzkChannelId?: string; entries?: any[] };
    const { chzzkChannelId, entries } = body;

    if (!chzzkChannelId) {
      return reply.status(400).send({ error: 'chzzkChannelId is required' });
    }

    if (!await requireSelf(request, reply, chzzkChannelId)) return;

    if (!Array.isArray(entries) || entries.length === 0) {
      return reply.status(400).send({ error: 'entries array is required and must not be empty' });
    }

    const { data: user, error: userError } = await getSupabase()
      .from('users')
      .select('id, chzzk_channel_id, chzzk_channel_name')
      .eq('chzzk_channel_id', chzzkChannelId)
      .single();

    if (userError || !user) {
      return reply.status(404).send({ error: 'User not found', chzzkChannelId });
    }

    const results = [];

    for (const entry of entries) {
      const { riotPuuid, gameType, queueType, tier, rank, leaguePoints, wins, losses, gameName, tagLine, isPublic } = entry;

      if (!riotPuuid || !gameType) {
        results.push({ gameType: gameType ?? 'unknown', error: 'riotPuuid and gameType are required' });
        continue;
      }

      if (!['lol', 'tft'].includes(gameType)) {
        results.push({ gameType, error: 'gameType must be "lol" or "tft"' });
        continue;
      }

      const { data, error } = await getSupabase()
        .from('tier_cache')
        .upsert(
          {
            chzzk_channel_id: chzzkChannelId,
            riot_puuid: riotPuuid,
            game_type: gameType,
            queue_type: queueType ?? null,
            tier: tier ?? null,
            rank: rank ?? null,
            league_points: leaguePoints ?? 0,
            wins: wins ?? 0,
            losses: losses ?? 0,
            riot_game_name: gameName ?? null,
            riot_tag_line: tagLine ?? null,
            is_public: isPublic ?? true,
            cached_at: new Date().toISOString(),
          },
          { onConflict: 'chzzk_channel_id,game_type' }
        )
        .select()
        .single();

      if (error) {
        results.push({ gameType, error: error.message });
      } else {
        results.push({ gameType, success: true, data });
        await broadcastToChannel(chzzkChannelId, 'tier_updated', {
          chzzkChannelName: user.chzzk_channel_name,
          gameType,
          tier: tier ?? null,
          rank: rank ?? null,
          leaguePoints: leaguePoints ?? 0,
          isPublic: isPublic ?? true,
        });
      }
    }

    return reply.send({ results });
  });

  app.delete('/api/chzzk/tier-cache', async (request, reply) => {
    const { chzzkChannelId, gameType } = request.query as { chzzkChannelId?: string; gameType?: string };

    if (!chzzkChannelId) {
      return reply.status(400).send({ error: 'chzzkChannelId parameter is required' });
    }

    if (!await requireSelf(request, reply, chzzkChannelId)) return;

    if (gameType && !['lol', 'tft'].includes(gameType)) {
      return reply.status(400).send({ error: 'gameType must be "lol" or "tft"' });
    }

    const { data: user } = await getSupabase()
      .from('users')
      .select('chzzk_channel_name')
      .eq('chzzk_channel_id', chzzkChannelId)
      .single();

    let query = getSupabase()
      .from('tier_cache')
      .delete()
      .eq('chzzk_channel_id', chzzkChannelId);

    if (gameType) {
      query = query.eq('game_type', gameType);
    }

    const { error } = await query;

    if (error) {
      return reply.status(500).send({ error: error.message });
    }

    await broadcastToChannel(chzzkChannelId, 'tier_deleted', {
      chzzkChannelName: user?.chzzk_channel_name ?? null,
      gameType: gameType ?? null,
    });

    return reply.send({ success: true });
  });
}
