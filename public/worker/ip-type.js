import { boundedJson, json, publicIp } from './http.js';

const ENDPOINT = 'http://ip-api.com/json';
const FIELDS = 'status,query,hosting,mobile,proxy';
const TIMEOUT_MS = 5000;
const CACHE_TTL = 'public, max-age=3600';
const FALLBACK_BACKOFF_S = 60;

let pausedUntil = 0;

const unavailable = () => json({ available: false });

export async function ipType(value, origin) {
  const ip = publicIp(value);
  const store = globalThis.caches?.default;
  const cacheKey = new Request(`${origin}/api/ip-type/${encodeURIComponent(ip)}?v=2`);
  const hit = await store?.match(cacheKey).catch(() => undefined);
  if (hit) return hit;
  if (Date.now() < pausedUntil) return unavailable();

  let response;
  try {
    response = await fetch(`${ENDPOINT}/${encodeURIComponent(ip)}?fields=${FIELDS}`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return unavailable();
  }

  try {
    if (response.status === 429 || response.headers.get('X-Rl') === '0') {
      const ttl = Number(response.headers.get('X-Ttl'));
      pausedUntil =
        Date.now() + (Number.isFinite(ttl) && ttl > 0 ? ttl : FALLBACK_BACKOFF_S) * 1000;
    }
    if (!response.ok) {
      await response.body?.cancel();
      return unavailable();
    }

    const data = await boundedJson(response, 4096);
    const flags = [data.hosting, data.mobile, data.proxy];
    const usable =
      data.status === 'success' &&
      flags.every((flag) => typeof flag === 'boolean') &&
      publicIp(data.query) === ip;
    if (!usable) return unavailable();

    const result = Response.json(
      { available: true, hosting: data.hosting, mobile: data.mobile, proxy: data.proxy },
      { headers: { 'Cache-Control': CACHE_TTL, 'X-Content-Type-Options': 'nosniff' } }
    );
    await store?.put(cacheKey, result.clone()).catch(() => {});
    return result;
  } catch {
    return unavailable();
  }
}
