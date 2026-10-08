import { edgeMemory, rememberEdge } from './edge-memory.js';

export const STATUS_CACHE_TTL_SECONDS = 60;
export const STATUS_FAILURE_TTL_SECONDS = 15;
export const STATUS_CACHE_CONTROL = `public, max-age=${STATUS_CACHE_TTL_SECONDS}, s-maxage=${STATUS_CACHE_TTL_SECONDS}`;
export const STATUS_CACHE_VERSION = 2;
const STATUS_STALE_MS = 5 * 60 * 1000;

// cache.match logs a 504 (and cache.put of an uncacheable response logs a 5xx)
// even when the Worker itself returns 200. Keep results in the isolate instead.
export const STATUS_UPSTREAM_CF = {
  cacheEverything: true,
  cacheTtlByStatus: {
    '200-299': STATUS_CACHE_TTL_SECONDS,
    '400-599': -1,
  },
};

export function withStatusSignal(signal, init = {}) {
  return {
    ...init,
    signal,
    cf: { ...STATUS_UPSTREAM_CF, ...init.cf },
  };
}

export function statusFetch(url, init = {}) {
  const timeout = AbortSignal.timeout(10_000);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return fetch(url, {
    ...init,
    signal,
    cf: { ...STATUS_UPSTREAM_CF, ...init.cf },
  });
}

export function unavailableStatus(service) {
  return {
    temporary: true,
    status: { indicator: 'unknown', description: '官方状态暂时不可达' },
    fetchedAt: new Date().toISOString(),
    source: service.url,
  };
}

function publishStatus(data) {
  if (!data || typeof data !== 'object') return data;
  const { temporary: _temporary, ...publicData } = data;
  return publicData;
}

function cacheControlFor(seconds) {
  return `public, max-age=${seconds}, s-maxage=${seconds}`;
}

export function isValidStatusPayload(data, service) {
  if (!data || typeof data !== 'object') return false;
  if (data.source !== service.url) return false;
  if (typeof data.fetchedAt !== 'string' || Number.isNaN(Date.parse(data.fetchedAt))) return false;
  const status = data.status;
  if (!status || typeof status !== 'object') return false;
  if (typeof status.indicator !== 'string' || typeof status.description !== 'string') return false;
  if (data.incidents !== undefined && !Array.isArray(data.incidents)) return false;
  if (data.components !== undefined && !Array.isArray(data.components)) return false;
  if (
    data.evidence !== undefined &&
    (!data.evidence ||
      typeof data.evidence !== 'object' ||
      !['official', 'reachability'].includes(data.evidence.kind) ||
      typeof data.evidence.label !== 'string')
  )
    return false;
  return true;
}

function readFresh(store, key, service, now) {
  const hit = store.status.get(key);
  if (!hit || now >= hit.freshUntil || !isValidStatusPayload(hit.data, service)) return null;
  return {
    data: hit.data,
    cacheable: true,
    cacheControl: hit.cacheControl,
  };
}

export async function cachedStatus(service, load) {
  const key = `${STATUS_CACHE_VERSION}\0${service.id}\0${service.url}`;
  const memory = rememberEdge();
  const store = edgeMemory();
  const fresh = memory ? readFresh(store, key, service, Date.now()) : null;
  if (fresh) return fresh;

  let pending = store.inflight.get(key);
  if (!pending) {
    pending = (async () => {
      let loaded;
      try {
        loaded = await load();
      } catch {
        loaded = null;
      }
      if (!loaded) loaded = unavailableStatus(service);
      const published = publishStatus(loaded);
      const valid = isValidStatusPayload(published, service);
      if (!valid) return { data: published, cacheable: false };
      const temporary = loaded.temporary === true;
      if (temporary && memory) {
        const previous = store.status.get(key);
        if (
          previous &&
          Date.now() < previous.staleUntil &&
          previous.data.status?.indicator !== 'unknown' &&
          isValidStatusPayload(previous.data, service)
        ) {
          previous.freshUntil = Date.now() + STATUS_FAILURE_TTL_SECONDS * 1000;
          return {
            data: previous.data,
            cacheable: true,
            cacheControl: previous.cacheControl,
          };
        }
      }
      const seconds = temporary ? STATUS_FAILURE_TTL_SECONDS : STATUS_CACHE_TTL_SECONDS;
      const cacheControl = cacheControlFor(seconds);
      if (memory) {
        const ttl = seconds * 1000;
        store.status.set(key, {
          data: published,
          freshUntil: Date.now() + ttl,
          staleUntil: Date.now() + (temporary ? ttl : STATUS_STALE_MS),
          cacheControl,
        });
      }
      return { data: published, cacheable: true, cacheControl };
    })().finally(() => {
      if (store.inflight.get(key) === pending) store.inflight.delete(key);
    });
    store.inflight.set(key, pending);
  }
  return pending;
}
