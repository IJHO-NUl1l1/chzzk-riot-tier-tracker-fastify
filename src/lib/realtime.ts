import { getSupabase } from './supabase';

export async function broadcastToChannel(
  chzzkChannelId: string,
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  const supabase = getSupabase();
  const channel = supabase.channel(`tier_updates:${chzzkChannelId}`);

  await channel.send({
    type: 'broadcast',
    event,
    payload: { chzzkChannelId, ...payload },
  });

  supabase.removeChannel(channel);
}
