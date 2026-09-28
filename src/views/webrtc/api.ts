import { t } from '@/i18n';
import { normalizePublicIp } from '@/lib/diagnostics';
import { endpoint, trace } from '@/lib/network';
import type { Geo, RtcResult } from '@/lib/types';

const DEFAULT_STUN_ENDPOINTS = [
  'stun:stun.l.google.com:19302',
  'stun:stun.cloudflare.com:3478',
  'stun:stun.l.google.com:443',
  'stun:stun.cloudflare.com:443',
] as const;
const customStun = import.meta.env?.VITE_WEBRTC_STUN_URL;
export const STUN_ENDPOINTS = [
  ...DEFAULT_STUN_ENDPOINTS,
  ...(typeof customStun === 'string' && customStun.startsWith('stun:') ? [customStun] : []),
];

export function isPublicCandidate(ip: string): boolean {
  return Boolean(normalizePublicIp(ip));
}

export function compareStunEndpointFamilies(
  rows: readonly Pick<RtcResult, 'ip' | 'endpoint' | 'public' | 'candidateType'>[]
) {
  const byFamily = new Map<number, Map<string, Set<string>>>();
  for (const row of rows) {
    if (
      !row.public ||
      (row.candidateType !== 'srflx' && row.candidateType !== 'prflx') ||
      !row.endpoint
    )
      continue;
    const normalized = normalizePublicIp(row.ip);
    if (!normalized) continue;
    const endpoints = byFamily.get(normalized.version) ?? new Map();
    const ips = endpoints.get(row.endpoint) ?? new Set<string>();
    ips.add(normalized.ip);
    endpoints.set(row.endpoint, ips);
    byFamily.set(normalized.version, endpoints);
  }
  for (const endpoints of byFamily.values()) {
    if (endpoints.size < 2) continue;
    const signatures = new Set([...endpoints.values()].map((ips) => [...ips].sort().join(',')));
    if (signatures.size > 1) return true;
  }
  return false;
}

export function sameIpFamily(left: string | undefined, right: string | undefined) {
  if (!left || !right) return false;
  const leftVersion = normalizePublicIp(left)?.version;
  const rightVersion = normalizePublicIp(right)?.version;
  return leftVersion !== undefined && leftVersion === rightVersion;
}

function parseCandidate(candidate: RTCIceCandidate, endpointUrl: string) {
  const fields = candidate.candidate.trim().split(/\s+/);
  const ip = candidate.address ?? fields[4];
  if (!ip || ip.endsWith('.local')) return null;
  const type = candidate.type ?? fields[7];
  if (!['host', 'srflx', 'prflx', 'relay'].includes(type ?? '')) return null;
  const normalized = normalizePublicIp(ip);
  const canonicalIp = normalized?.ip ?? ip;
  const port = candidate.port ?? Number(fields[5]);
  const protocol = candidate.protocol ?? fields[2];
  const relatedAddress = candidate.relatedAddress ?? fields[9];
  return {
    ip: canonicalIp,
    candidateType: type as RtcResult['candidateType'],
    type:
      type === 'srflx' || type === 'prflx'
        ? t('公网 (STUN)')
        : type === 'relay'
          ? t('中继 (TURN)')
          : t('本地'),
    public: Boolean(normalized),
    endpoint: endpointUrl,
    port: Number.isFinite(port) ? port : undefined,
    protocol,
    relatedAddress,
    raw: candidate.candidate,
  } satisfies RtcResult;
}

async function collectEndpoint(stunUrl: string, signal: AbortSignal): Promise<RtcResult[]> {
  const pc = new RTCPeerConnection({ iceServers: [{ urls: stunUrl }] });
  const found = new Map<string, RtcResult>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    const gathered = new Promise<void>((resolve, reject) => {
      abort = () => {
        pc.close();
        reject(new DOMException(t('已取消'), 'AbortError'));
      };
      signal.addEventListener('abort', abort, { once: true });
      timer = setTimeout(resolve, 3000);
      pc.onicecandidate = ({ candidate }) => {
        if (!candidate) return resolve();
        const parsed = parseCandidate(candidate, stunUrl);
        if (parsed)
          found.set(
            `${parsed.ip}|${parsed.candidateType}|${parsed.port}|${parsed.protocol}`,
            parsed
          );
      };
    });
    pc.createDataChannel('ip-diagnostic');
    await Promise.all([
      gathered,
      (async () => {
        signal.throwIfAborted();
        await pc.setLocalDescription(await pc.createOffer());
      })(),
    ]);
    signal.throwIfAborted();
    return [...found.values()];
  } finally {
    clearTimeout(timer);
    if (abort) signal.removeEventListener('abort', abort);
    pc.onicecandidate = null;
    pc.close();
  }
}

export async function collectCandidates(
  signal: AbortSignal,
  stunUrls: readonly string[] = STUN_ENDPOINTS
): Promise<RtcResult[]> {
  if (typeof RTCPeerConnection === 'undefined')
    throw new Error(t('当前浏览器不支持 WebRTC，无法完成检测。'));
  const batches = await Promise.all(
    stunUrls.map((url) =>
      collectEndpoint(url, signal).catch((error) => {
        if (signal.aborted) throw error;
        return [];
      })
    )
  );
  return batches.flat();
}

export async function runWebRtc(_: void, signal: AbortSignal) {
  const probeId = crypto.randomUUID();
  const [baseline, candidates] = await Promise.all([
    endpoint<Geo>('/me', { signal }).catch(() => trace('1.1.1.1', signal).catch(() => null)),
    collectCandidates(signal),
  ]);
  const results = await Promise.all(
    candidates.map(async (row) => {
      if (!row.public) return row;
      try {
        return {
          ...row,
          geo: await endpoint<Geo>(`/geoip/${encodeURIComponent(row.ip)}`, {
            signal,
          }),
        };
      } catch {
        return row;
      }
    })
  );
  signal.throwIfAborted();
  const publicResults = results.filter(
    (row) => row.public && (row.candidateType === 'srflx' || row.candidateType === 'prflx')
  );
  const publicIps = new Set(publicResults.map((row) => row.ip));
  const splitTunnel = compareStunEndpointFamilies(publicResults);
  const report = await endpoint<{ httpIp?: string }>('/webrtc/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      probeId,
      baselineIp: baseline?.ip,
      candidates: results
        .filter(({ candidateType }) => candidateType === 'srflx' || candidateType === 'prflx')
        .map(({ ip, candidateType, endpoint, port, protocol }) => ({
          ip,
          type: candidateType,
          endpoint,
          port,
          protocol,
        })),
    }),
    signal,
  }).catch(() => undefined);
  const effectiveBaseline = report?.httpIp ?? baseline?.ip;
  const effectiveLeakIps = [...publicIps].filter(
    (ip) => sameIpFamily(ip, effectiveBaseline) && ip !== effectiveBaseline
  );
  const comparablePublicResults = publicResults.filter((row) =>
    sameIpFamily(row.ip, effectiveBaseline)
  );
  const udpBlocked = Boolean(
    effectiveBaseline && candidates.length > 0 && publicResults.length === 0
  );
  const different = effectiveLeakIps.length > 0;
  const verdict = !effectiveBaseline
    ? t('已采集到 UDP 出口，但 HTTP 基准获取失败，无法判断是否一致。')
    : different
      ? t('观测到与 HTTP 不同的 UDP 地址，请核对代理／TUN 的 UDP 规则。')
      : splitTunnel
        ? t('不同 STUN 端点返回了不同 UDP 地址，请结合 IP 族核对路由。')
        : udpBlocked
          ? t('HTTPS 正常但未发现公网 STUN 地址，UDP 可能已被阻断。')
          : publicResults.length === 0
            ? t('未采集到公网候选；可能被限制或 UDP 被阻断，不能据此判定安全。')
            : comparablePublicResults.length === 0
              ? t('STUN 只返回了不同 IP 族地址，无法与 HTTP 对照判断。')
              : t('本次采样的公网 UDP 出口与 HTTP 出口一致。');
  return {
    baseline: report?.httpIp && baseline?.ip !== report.httpIp ? { ip: report.httpIp } : baseline,
    results,
    verdict,
    different,
    leakIps: effectiveLeakIps,
    splitTunnel,
    udpBlocked,
    probeId,
  };
}
