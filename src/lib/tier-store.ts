import { LRUCache } from 'lru-cache';

export type TierEntry = {
  game_type: string;
  tier: string | null;
  rank: string | null;
  league_points: number;
  riot_game_name: string | null;
  riot_tag_line: string | null;
};

const cache = new LRUCache<string, TierEntry[]>({
  max: 500,
  ttl: 5 * 60 * 1000, // 5분
});

function key(chzzkName: string): string {
  return chzzkName.toLowerCase();
}

export function getTierCache(chzzkName: string): TierEntry[] | undefined {
  return cache.get(key(chzzkName));
}

export function setTierCache(chzzkName: string, entries: TierEntry[]): void {
  cache.set(key(chzzkName), entries);
}

export function invalidateTierCache(chzzkName: string | null | undefined): void {
  if (!chzzkName) return;
  cache.delete(key(chzzkName));
}
