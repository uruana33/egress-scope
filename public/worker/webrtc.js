import { isIP } from 'node:net';

import { HttpError, publicIp } from './http.js';

const CANDIDATE_TYPES = new Set(['host', 'srflx', 'prflx', 'relay']);
const PROTOCOLS = new Set(['udp', 'tcp']);

function candidateList(value) {
  if (!Array.isArray(value) || value.length > 128) throw new HttpError(400, 'ICE 候选数量无效');
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object') return [];
    const { ip, type, endpoint, port, protocol } = candidate;
    if (
      typeof ip !== 'string' ||
      ip.length > 64 ||
      typeof type !== 'string' ||
      !CANDIDATE_TYPES.has(type) ||
      typeof endpoint !== 'string' ||
      endpoint.length > 160 ||
      !endpoint.startsWith('stun:') ||
      !PROTOCOLS.has(protocol) ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535
    )
      return [];
    let canonicalIp = ip;
    if (type === 'srflx' || type === 'prflx') {
      try {
        canonicalIp = publicIp(ip);
      } catch {
        return [];
      }
    }
    return [{ ip: canonicalIp, type, endpoint, port, protocol }];
  });
}

export function reportWebRtc(request, body) {
  if (typeof body.probeId !== 'string' || !/^[\da-f-]{20,80}$/i.test(body.probeId))
    throw new HttpError(400, '检测会话标识无效');
  const candidates = candidateList(body.candidates);
  const httpIp = request.headers.get('CF-Connecting-IP');
  let observedHttpIp;
  try {
    observedHttpIp = httpIp ? publicIp(httpIp) : undefined;
  } catch {
    observedHttpIp = undefined;
  }
  const srflx = candidates.filter((candidate) => ['srflx', 'prflx'].includes(candidate.type));
  const ips = [...new Set(srflx.map((candidate) => candidate.ip))];
  const endpointIps = Object.fromEntries(
    [...new Set(srflx.map((candidate) => candidate.endpoint))].map((endpoint) => [
      endpoint,
      [
        ...new Set(
          srflx
            .filter((candidate) => candidate.endpoint === endpoint)
            .map((candidate) => candidate.ip)
        ),
      ],
    ])
  );
  const sameFamily = (left, right) => Boolean(left && right && isIP(left) === isIP(right));
  const leakIps = ips.filter((ip) => sameFamily(ip, observedHttpIp) && ip !== observedHttpIp);
  const endpointFamilies = new Map();
  for (const candidate of srflx) {
    const family = isIP(candidate.ip);
    const endpoints = endpointFamilies.get(family) ?? new Map();
    const values = endpoints.get(candidate.endpoint) ?? new Set();
    values.add(candidate.ip);
    endpoints.set(candidate.endpoint, values);
    endpointFamilies.set(family, endpoints);
  }
  const splitTunnel = [...endpointFamilies.values()].some((endpoints) => {
    if (endpoints.size < 2) return false;
    return new Set([...endpoints.values()].map((values) => [...values].sort().join(','))).size > 1;
  });
  return {
    probeId: body.probeId,
    httpIp: observedHttpIp,
    srflxByEndpoint: endpointIps,
    leakIps,
    splitTunnel,
    udpBlocked: Boolean(observedHttpIp && candidates.length > 0 && srflx.length === 0),
    candidateCount: candidates.length,
  };
}
