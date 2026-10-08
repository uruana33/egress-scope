const STORE = '__egressScopeCache';

export function edgeMemory() {
  return (globalThis[STORE] ??= {
    status: new Map(),
    inflight: new Map(),
    cross: new Map(),
    type: new Map(),
  });
}

/**
 * Workers always expose caches.default. Unit tests leave it unset so cases
 * do not reuse each other's results. A fake caches.default turns memory
 * caching on without calling cache.match or cache.put.
 */
export function rememberEdge() {
  return Boolean(globalThis.caches?.default);
}

export function remember(map, key, value, limit) {
  map.delete(key);
  map.set(key, value);
  while (map.size > limit) map.delete(map.keys().next().value);
}
