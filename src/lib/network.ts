import { t } from '@/i18n';
import { normalizePublicIp } from '@/lib/diagnostics';

export type ResponseMode = 'json' | 'text' | 'opaque' | 'headers';

export class HttpRequestError extends Error {
  status: number;
  httpStatus: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.httpStatus = status;
  }
}

/** Budget for a single source probe after it leaves the diagnostic queue. */
export const SOURCE_PROBE_TIMEOUT_MS = 8_000;
const REQUEST_TIMEOUT_MS = 12_000;
const EGRESS_TIMEOUT_MS = 3000;
const POOL_LIMIT = 6;

const abortReason = (signal?: AbortSignal) =>
  signal?.reason ?? new DOMException('已取消', 'AbortError');

type QueueEntry<T> = {
  signal?: AbortSignal;
  task: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
  cancelled: boolean;
  priority: number;
  onAbort?: () => void;
};

/**
 * Caps in-flight diagnostic operations. Site probes and geo lookups use
 * separate limiters so attribution work cannot starve egress reads.
 */
export function createConcurrencyLimiter(limit: number) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('并发上限必须是正整数');
  let active = 0;
  const queue: QueueEntry<unknown>[] = [];

  const launch = (entry: QueueEntry<unknown>) => {
    active += 1;
    entry.onAbort?.();
    void Promise.resolve()
      .then(entry.task)
      .then(entry.resolve, entry.reject)
      .finally(() => {
        active -= 1;
        drain();
      });
  };

  const drain = () => {
    while (active < limit && queue.length) {
      const entry = queue.shift()!;
      if (entry.cancelled || entry.signal?.aborted) {
        entry.onAbort?.();
        entry.reject(abortReason(entry.signal));
      } else {
        launch(entry);
      }
    }
  };

  const run = <T>(signal: AbortSignal | undefined, task: () => Promise<T>, priority = 0) => {
    if (signal?.aborted) return Promise.reject(abortReason(signal));
    return new Promise<T>((resolve, reject) => {
      const entry: QueueEntry<T> = { signal, task, resolve, reject, cancelled: false, priority };
      if (signal) {
        const onAbort = () => {
          entry.cancelled = true;
          reject(abortReason(signal));
        };
        signal.addEventListener('abort', onAbort, { once: true });
        entry.onAbort = () => signal.removeEventListener('abort', onAbort);
      }
      queue.push(entry as QueueEntry<unknown>);
      queue.sort((left, right) => right.priority - left.priority);
      drain();
    });
  };

  return {
    run,
    get pending() {
      return queue.length;
    },
    get active() {
      return active;
    },
  };
}

const errorMessage = async (response: Response) => {
  try {
    const body = await response.json();
    if (typeof body.error === 'string') return t(body.error);
  } catch {
    /* Non-JSON upstream. */
  }
  return t('请求失败 ({0})', [response.status]);
};

/** Only HTTP transport for browser probes and API calls. Never proxy browser probes. */
export async function request<T>(
  url: string,
  init: RequestInit = {},
  mode: ResponseMode = 'json'
): Promise<T> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  signal.throwIfAborted();
  let onAbort: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, { ...init, signal });
        if (mode === 'opaque') return undefined as T;
        if (!response.ok) throw new HttpRequestError(response.status, await errorMessage(response));
        if (mode === 'headers') return response.headers as T;
        return (mode === 'text' ? response.text() : response.json()) as Promise<T>;
      })(),
      aborted,
    ]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

export function endpoint<T>(path: string, init?: RequestInit) {
  const base = import.meta.env.VITE_API_BASE_URL ?? '/api';
  return request<T>(`${base}${path}`, init);
}

export interface TraceResult {
  ip: string;
  country_code?: string;
  colo?: string;
  source: string;
}

export function parseTrace(text: string): TraceResult {
  const fields = Object.fromEntries(
    text
      .trim()
      .split('\n')
      .map((line) => {
        const i = line.indexOf('=');
        return [line.slice(0, i), line.slice(i + 1)];
      })
  );
  const normalized = normalizePublicIp(fields.ip);
  if (!normalized) throw new Error(t('目标站点未返回可读取的出口 IP'));
  return {
    ip: normalized.ip,
    country_code: fields.loc,
    colo: fields.colo,
    source: 'Cloudflare Trace',
  };
}

export async function trace(domain: string, signal?: AbortSignal) {
  const body = await request<string>(
    `https://${domain}/cdn-cgi/trace`,
    {
      signal: signal ?? AbortSignal.timeout(SOURCE_PROBE_TIMEOUT_MS),
      cache: 'no-store',
    },
    'text'
  );
  return parseTrace(body);
}

/**
 * Reads the browser's default egress IP through a CORS-friendly public API.
 * This is the exit used to reach that endpoint, which may differ from the
 * exit used to reach a specific site when traffic is split by domain.
 */
export async function browserEgressIp(signal?: AbortSignal): Promise<TraceResult> {
  const egressSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(EGRESS_TIMEOUT_MS)])
    : AbortSignal.timeout(EGRESS_TIMEOUT_MS);
  const data = await request<{ ip?: unknown }>('https://api.ip.sb/jsonip', {
    signal: egressSignal,
    cache: 'no-store',
  });
  const normalized = normalizePublicIp(data.ip);
  if (!normalized) throw new Error(t('未获取到可读取的出口 IP'));
  return {
    ip: normalized.ip,
    country_code: undefined,
    colo: undefined,
    source: 'ip.sb',
  };
}

/** Bound browser concurrency without retaining request state between runs. */
export async function pool<T, R>(
  items: T[],
  run: (item: T, index: number) => Promise<R>,
  limit = POOL_LIMIT
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await run(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export function maskedIp(ip: string, hidden: boolean) {
  if (!hidden) return ip;
  if (ip.includes(':')) {
    return `${ip.split(':').slice(0, 2).join(':')}:****:****`;
  }
  return ip
    .split('.')
    .map((octet, index) => (index > 1 ? '*' : octet))
    .join('.');
}
