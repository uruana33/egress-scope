import { isIP } from 'node:net';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const JSON_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

export function json(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: { ...JSON_HEADERS, ...headers } });
}

const rejectReserved = () => {
  throw new HttpError(400, '不支持私有、回环或保留地址');
};

function unmapIpv6(ip) {
  if (!ip.startsWith('::ffff:')) return ip;
  const [high, low] = ip
    .slice(7)
    .split(':')
    .map((v) => parseInt(v, 16));
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

function checkIpv4(ip) {
  const [a, b, c] = ip.split('.').map(Number);
  const reserved =
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113);
  if (reserved) rejectReserved();
}

function checkIpv6(ip) {
  // Accept global unicast only; reject local, documentation and benchmark ranges.
  if (!/^[23]/.test(ip) || /^2001:(db8|2|10|20):/.test(ip) || /^2001::/.test(ip)) {
    rejectReserved();
  }
}

export function publicIp(value) {
  if (!isIP(value)) throw new HttpError(400, '请输入有效的公网 IPv4 或 IPv6 地址');
  const ip = isIP(value) === 6 ? new URL(`https://[${value}]/`).hostname.slice(1, -1) : value;
  if (isIP(ip) === 6) {
    const unmapped = unmapIpv6(ip);
    if (unmapped !== ip) return publicIp(unmapped);
    checkIpv6(ip);
  } else {
    checkIpv4(ip);
  }
  return ip;
}

const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const DENIED_TLD = /\.(localhost|local|internal|test|invalid|example)$/;

export function target(value) {
  if (typeof value !== 'string' || !value || value.length > 253) {
    throw new HttpError(400, '请输入有效的域名或 IP');
  }
  const normalized = value.trim().replace(/\.$/, '').toLowerCase();
  if (isIP(normalized)) return publicIp(normalized);
  if (!DOMAIN_RE.test(normalized) || DENIED_TLD.test(normalized)) {
    throw new HttpError(400, '请输入公网域名，不包含协议、路径或端口');
  }
  return normalized;
}

async function readFully(response, { maxBytes, onTooLarge, onEmpty }) {
  const reader = response.body?.getReader();
  if (!reader) throw new HttpError(...onEmpty);
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw onTooLarge();
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

export async function boundedJson(response, maxBytes = 2_000_000, errorStatus = 502) {
  const bytes = await readFully(response, {
    maxBytes,
    onTooLarge: () => new HttpError(errorStatus === 400 ? 413 : errorStatus, 'JSON 内容过大'),
    onEmpty: [errorStatus, 'JSON 内容为空'],
  });
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError(errorStatus, '内容不是有效 JSON');
  }
}

export async function boundedText(response, maxBytes = 400_000) {
  const bytes = await readFully(response, {
    maxBytes,
    onTooLarge: () => new HttpError(502, '页面内容过大'),
    onEmpty: [502, '页面内容为空'],
  });
  return new TextDecoder().decode(bytes);
}

export async function upstream(url, init = {}, maxBytes = 2_000_000) {
  let response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new HttpError(502, '外部数据源连接失败或超时');
  }
  if (!response.ok) {
    await response.body?.cancel();
    const limited = response.status === 429;
    throw new HttpError(
      limited ? 429 : 502,
      limited ? '外部数据源限流，请稍后重试' : `外部数据源暂不可用 (${response.status})`
    );
  }
  return boundedJson(response, maxBytes);
}

export async function inputJson(request, maxBytes = 4096) {
  if (!request.headers.get('Content-Type')?.includes('application/json')) {
    throw new HttpError(415, '需要 application/json');
  }
  const value = await boundedJson(request, maxBytes, 400);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, '需要 JSON 对象');
  }
  return value;
}
