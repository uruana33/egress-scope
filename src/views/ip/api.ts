import { t } from '@/i18n';
import { endpoint, request } from '@/lib/network';

import { type CoffeeIp, adaptCoffee } from './coffee.ts';
import type { CrossIntel } from './model/cross-intel';
import { parseCoffeeIp } from './model/schema.ts';

/** IPv6 has many spellings for one address; compare canonical forms. */
const normalize = (value: string) =>
  value.includes(':') ? new URL(`https://[${value}]/`).hostname : value;

export async function lookupIp(ip: string, signal?: AbortSignal) {
  const raw = await request<unknown>(
    `https://ip.net.coffee/api/ip/lookup/${encodeURIComponent(ip)}`,
    { signal, mode: 'cors', credentials: 'omit', cache: 'no-store' }
  );
  const data: CoffeeIp = parseCoffeeIp(raw);
  if (normalize(data.ip) !== normalize(ip)) throw new Error(t('IP 数据源返回的地址不匹配'));
  return adaptCoffee(data);
}

export async function lookupCross(ip: string, signal?: AbortSignal) {
  return endpoint<CrossIntel>(`/ip/cross/${encodeURIComponent(ip)}`, {
    signal,
    cache: 'no-store',
  });
}
