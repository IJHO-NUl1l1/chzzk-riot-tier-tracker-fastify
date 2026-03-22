import { LRUCache } from 'lru-cache';
import axios from 'axios';

const cache = new LRUCache<string, object>({ max: 1000, ttl: 1000 * 60 * 5 });

export async function cachedGet(url: string, apiKey: string): Promise<object> {
  const cached = cache.get(url);
  if (cached) return cached;
  const response = await axios.get(url, { headers: { 'X-Riot-Token': apiKey } });
  cache.set(url, response.data);
  return response.data;
}

const REGION_TO_PLATFORM: Record<string, string> = {
  kr: 'kr',
  jp: 'jp1',
  na: 'na1',
  euw: 'euw1',
  eune: 'eun1',
  br: 'br1',
  lan: 'la1',
  las: 'la2',
  oce: 'oc1',
  ru: 'ru',
  tr: 'tr1',
};

const REGION_TO_ROUTING: Record<string, string> = {
  kr: 'asia',
  jp: 'asia',
  na: 'americas',
  br: 'americas',
  lan: 'americas',
  las: 'americas',
  oce: 'sea',
  euw: 'europe',
  eune: 'europe',
  tr: 'europe',
  ru: 'europe',
};

export function getRegionHost(region: string): string | null {
  const platform = REGION_TO_PLATFORM[region.toLowerCase()];
  return platform ? `${platform}.api.riotgames.com` : null;
}

export function getRoutingValue(region: string): string {
  return REGION_TO_ROUTING[region.toLowerCase()] || 'asia';
}
