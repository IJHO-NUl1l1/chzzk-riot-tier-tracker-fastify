import { getSupabase } from './supabase';

/**
 * Supabase Realtime Broadcast — 서버 → 클라이언트 push
 * 채널명: tier_updates:{chzzkChannelId}
 */
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
