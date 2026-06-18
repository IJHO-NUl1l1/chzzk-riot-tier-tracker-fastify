import { getSupabase } from './supabase';

export async function broadcastToChannel(
  chzzkChannelId: string,
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  const supabase = getSupabase();
  const channel = supabase.channel(`tier_updates:${chzzkChannelId}`);

  await channel.httpSend(event, { chzzkChannelId, ...payload });

  supabase.removeChannel(channel);
}
