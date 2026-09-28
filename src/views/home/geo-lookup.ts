import { t } from '@/i18n';
import { normalizePublicIp } from '@/lib/diagnostics';
import { createConcurrencyLimiter, request } from '@/lib/network';
import type { Geo } from '@/lib/types';

export const geoLimiter = createConcurrencyLimiter(2);

const timedSignal = (signal: AbortSignal | undefined, ms: number) =>
  signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms);

async function geoFromIpSb(ip: string, signal?: AbortSignal, timeoutMs = 3000): Promise<Geo> {
  const data = await request<Geo>(`https://api.ip.sb/geoip/${encodeURIComponent(ip)}`, {
    signal: timedSignal(signal, timeoutMs),
  });
  const returned = normalizePublicIp(data.ip);
  if (!returned || returned.ip !== ip || (!data.country && !data.isp))
    throw new Error(t('归属信息不完整'));
  return { ...data, ip, source: 'ip.sb' };
}

async function geoFromIpWhois(ip: string, signal?: AbortSignal, timeoutMs = 3000): Promise<Geo> {
  const data = await request<{
    success: boolean;
    ip?: string;
    country?: string;
    country_code?: string;
    region?: string;
    city?: string;
    connection?: { isp?: string; asn?: number };
    latitude?: number;
    longitude?: number;
    timezone?: { id?: string };
  }>(`https://ipwho.is/${encodeURIComponent(ip)}`, {
    signal: timedSignal(signal, timeoutMs),
  });
  if (!data.success) throw new Error(t('归属信息暂不可用，请稍后重试'));
  const returned = normalizePublicIp(data.ip);
  if (!returned || returned.ip !== ip) throw new Error(t('归属信息不完整'));
  return {
    ip,
    country: data.country,
    country_code: data.country_code,
    region: data.region,
    city: data.city,
    isp: data.connection?.isp,
    asn: data.connection?.asn,
    latitude: data.latitude,
    longitude: data.longitude,
    timezone: data.timezone?.id,
    source: 'ipwho.is',
  };
}

async function geoUnbounded(ip: string, signal?: AbortSignal, timeoutMs = 3000): Promise<Geo> {
  const target = normalizePublicIp(ip);
  if (!target) throw new Error(t('未获取到有效 IP'));
  try {
    return await geoFromIpSb(target.ip, signal, timeoutMs);
  } catch (error) {
    if (signal?.aborted) throw error;
    return geoFromIpWhois(target.ip, signal, timeoutMs);
  }
}

export function lookupGeo(ip: string, signal?: AbortSignal, timeoutMs = 3000) {
  return geoLimiter.run(signal, () => geoUnbounded(ip, signal, timeoutMs));
}

const DOMESTIC_PROBES = [
  {
    url: 'https://necaptcha.nosdn.127.net/ab7f4275c1744aa28e0a8f3a1c58c532.png',
    header: 'cdn-user-ip',
  },
  {
    url: 'https://perfops.byte-test.com/500b-bench.jpg',
    header: 'x-request-ip',
  },
] as const;

async function domesticIpUnbounded(signal?: AbortSignal): Promise<Geo> {
  for (const probe of DOMESTIC_PROBES) {
    signal?.throwIfAborted();
    try {
      const headers = await request<Headers>(
        probe.url,
        {
          method: 'HEAD',
          mode: 'cors',
          credentials: 'omit',
          redirect: 'error',
          cache: 'no-store',
          signal: timedSignal(signal, 3000),
        },
        'headers'
      );
      const normalized = normalizePublicIp(headers.get(probe.header)?.trim());
      if (normalized?.version === 4)
        return { ip: normalized.ip, source: new URL(probe.url).hostname };
    } catch (error) {
      if (signal?.aborted) throw error;
    }
  }
  throw new Error(t('国内出口未知：目标站点可能限制跨域读取'));
}

export async function fetchDomesticIp(signal?: AbortSignal) {
  return domesticIpUnbounded(signal);
}

async function browserIpUnbounded(version: 4 | 6, signal?: AbortSignal): Promise<Geo> {
  const data = await request<{ ip: string }>(`https://api${version}.ipify.org?format=json`, {
    signal: timedSignal(signal, 3000),
    cache: 'no-store',
  });
  const normalized = normalizePublicIp(data.ip);
  if (!normalized || normalized.version !== version) throw new Error(t('未获取到有效 IP'));
  return { ip: normalized.ip, source: 'ipify' };
}

export function fetchBrowserIp(version: 4 | 6, signal?: AbortSignal) {
  return browserIpUnbounded(version, signal);
}
