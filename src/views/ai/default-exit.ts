import { t } from '@/i18n';
import { browserEgressIp, endpoint } from '@/lib/network';
import type { Geo } from '@/lib/types';
import { getDomesticIp } from '@/views/home/api';
import { collectCandidates } from '@/views/webrtc/api';

export type DefaultExitSource = {
  id: 'ipsb' | 'worker' | 'domestic' | 'webrtc';
  label: string;
  transport: 'http' | 'udp';
  ip?: string;
};

export type DefaultExitVerdict = 'verified' | 'split' | 'partial' | 'failed';

export interface DefaultExitResult {
  ip?: string;
  verdict: DefaultExitVerdict;
  sources: DefaultExitSource[];
  displaySource?: DefaultExitSource;
}

function withTimeout(signal: AbortSignal | undefined, ms: number) {
  return signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms);
}

export function selectDefaultExitDisplaySource(sources: readonly DefaultExitSource[]) {
  return (
    sources.find((source) => source.transport === 'http' && source.ip) ??
    sources.find((source) => source.ip)
  );
}

export function summarizeDefaultExit(sources: readonly DefaultExitSource[]): DefaultExitResult {
  const ips = sources.flatMap((source) => (source.ip ? [source.ip] : []));
  const unique = [...new Set(ips)];
  const httpCount = sources.filter((source) => source.transport === 'http' && source.ip).length;
  const verdict: DefaultExitVerdict = !unique.length
    ? 'failed'
    : unique.length > 1
      ? 'split'
      : httpCount >= 2
        ? 'verified'
        : 'partial';
  const displaySource = selectDefaultExitDisplaySource(sources);
  return {
    ip: displaySource?.ip,
    verdict,
    sources: [...sources],
    displaySource,
  };
}

/**
 * Cross-checks egress observations through four network paths:
 * a third-party echo (api.ip.sb), the first-party worker (/me), a domestic CDN
 * echo, and WebRTC STUN (UDP path). Agreement means the observations match;
 * disagreement reveals split routing, where no single value can stand in for
 * the egress used to reach a given platform.
 */
export async function checkDefaultExit(signal?: AbortSignal): Promise<DefaultExitResult> {
  signal?.throwIfAborted();
  const [ipsb, worker, domestic, webrtc] = await Promise.allSettled([
    browserEgressIp(withTimeout(signal, 4000)),
    endpoint<Geo>('/me', { signal: withTimeout(signal, 4000) }),
    getDomesticIp(withTimeout(signal, 3500)),
    collectCandidates(withTimeout(signal, 3500), ['stun:stun.cloudflare.com:3478']),
  ]);
  signal?.throwIfAborted();
  const rtcIp =
    webrtc.status === 'fulfilled'
      ? webrtc.value.find((row) => row.public && row.candidateType === 'srflx')?.ip
      : undefined;
  const sources: DefaultExitSource[] = [
    {
      id: 'ipsb',
      label: 'api.ip.sb',
      transport: 'http',
      ip: ipsb.status === 'fulfilled' ? ipsb.value.ip : undefined,
    },
    {
      id: 'worker',
      label: t('本站接口'),
      transport: 'http',
      ip: worker.status === 'fulfilled' ? worker.value.ip : undefined,
    },
    {
      id: 'domestic',
      label: t('国内 CDN'),
      transport: 'http',
      ip: domestic.status === 'fulfilled' ? domestic.value.ip : undefined,
    },
    { id: 'webrtc', label: 'WebRTC/STUN', transport: 'udp', ip: rtcIp },
  ];
  return summarizeDefaultExit(sources);
}
