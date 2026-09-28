export const POLL_LIMIT = 12;
export const BATCH_SIZE = 50;
export const REUSE_MS = 60_000;
export const CACHE_LIMIT = 20;

const BACKOFF = { base: 2000, step: 500, cap: 5000 } as const;

export const backoffDelay = (round: number) =>
  Math.min(BACKOFF.base + round * BACKOFF.step, BACKOFF.cap);

export function roundDelay(signal: AbortSignal, round: number, message: string) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException(message, 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, backoffDelay(round));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

const dedupeSorted = (list?: string[]) => (list ? [...new Set(list)].sort() : undefined);

export function measurementKey(input: {
  host: string;
  protocol?: string;
  nodes?: string[];
  regions?: string[];
  perRegion?: number;
  preferred?: boolean;
}) {
  return JSON.stringify({
    host: input.host.trim().toLowerCase(),
    protocol: input.protocol ?? 'icmp',
    nodes: dedupeSorted(input.nodes),
    regions: dedupeSorted(input.regions),
    perRegion: input.perRegion,
    preferred: input.preferred === true,
  });
}

export function inputBatches<T extends { nodes?: string[] }>(input: T): T[] {
  if (!input.nodes) return [input];
  const count = Math.ceil(input.nodes.length / BATCH_SIZE);
  return Array.from({ length: count }, (_, i) => ({
    ...input,
    nodes: input.nodes!.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE),
  }));
}

export class ResultCache<T> {
  private store = new Map<string, { time: number; data: T }>();

  prune(now: number) {
    for (const [key, entry] of this.store) {
      if (now - entry.time >= REUSE_MS) this.store.delete(key);
    }
  }

  get(key: string) {
    return this.store.get(key);
  }

  put(key: string, data: T, status: string) {
    if (status !== 'finished') return;
    if (this.store.size >= CACHE_LIMIT) {
      this.store.delete(this.store.keys().next().value!);
    }
    this.store.set(key, { time: Date.now(), data });
  }
}
