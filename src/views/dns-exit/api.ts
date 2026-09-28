import { t } from '@/i18n';
import { request } from '@/lib/network';

import {
  type DnsResolver,
  NSTOOL_GLOBALS,
  parseDnsClient,
  parseDnsResponse,
} from './dns-parsers.ts';

export type { DnsResolver } from './dns-parsers.ts';
export {
  parseDnsClient,
  parseDnsResponse,
  parseFastlyEndpoint,
  parseNstoolVars,
} from './dns-parsers.ts';

export const dnsSources = [
  { name: 'Surfshark', host: 'ipv4.surfsharkdns.com', path: '/', samples: 5 },
  {
    name: 'Fastly',
    host: 'u.fastly-analytics.com',
    path: '/debug_resolver',
    samples: 5,
  },
  {
    name: 'BrowserLeaks DNS4',
    host: 'dns4.browserleaks.net',
    path: '/',
    samples: 3,
  },
  {
    name: 'BrowserLeaks DNS6',
    host: 'dns6.browserleaks.net',
    path: '/',
    samples: 3,
  },
  {
    name: 'NetEase',
    host: 'nstool.netease.com',
    path: '/info.js',
    samples: 5,
    probe: 'script',
  },
] as const;

export type DnsExitHit = DnsResolver & {
  samples: number;
  sources: string[];
  sourceSamples: Record<string, number>;
};

function globalsSnapshot(keys: readonly string[]) {
  const target = globalThis as unknown as Record<string, unknown>;
  return keys.map((key) => target[key]);
}

function globalsRestore(keys: readonly string[], snapshot: unknown[]) {
  const target = globalThis as unknown as Record<string, unknown>;
  keys.forEach((key, index) => {
    try {
      target[key] = snapshot[index];
    } catch {
      /* nstool uses `var` on window; those bindings cannot be deleted. */
    }
  });
}

function readGlobals(keys: readonly string[]) {
  const target = globalThis as unknown as Record<string, unknown>;
  return Object.fromEntries(keys.map((key) => [key, target[key]]));
}

async function readNstoolScript(source: (typeof dnsSources)[number], signal: AbortSignal) {
  if (typeof document === 'undefined') throw new Error(t('未获取到 DNS 出口'));
  signal.throwIfAborted();
  const combined = AbortSignal.any([signal, AbortSignal.timeout(12_000)]);
  combined.throwIfAborted();
  const snapshot = globalsSnapshot(NSTOOL_GLOBALS);
  const script = document.createElement('script');
  script.async = true;
  script.charset = 'gbk';
  script.src = `https://${source.host}${source.path}?t=${cacheBuster()}`;
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      combined.removeEventListener('abort', onAbort);
      script.remove();
      const vars = readGlobals(NSTOOL_GLOBALS);
      globalsRestore(NSTOOL_GLOBALS, snapshot);
      if (error) reject(error);
      else resolve(vars);
    };
    const onAbort = () => finish(combined.reason ?? new DOMException('已取消', 'AbortError'));
    script.onload = () => finish();
    script.onerror = () => finish(new Error(t('未获取到 DNS 出口')));
    combined.addEventListener('abort', onAbort, { once: true });
    document.head.appendChild(script);
  });
}

/** Test seam: classic-script probes cannot use fetch (no CORS, HTML MIME). */
export const dnsScriptProbe = {
  read: readNstoolScript,
};

function isScriptSource(
  source: (typeof dnsSources)[number]
): source is (typeof dnsSources)[number] & { probe: 'script' } {
  return 'probe' in source && source.probe === 'script';
}

const cacheBuster = () => crypto.randomUUID().replaceAll('-', '').slice(0, 10);

export async function sampleDnsSource(source: (typeof dnsSources)[number], signal: AbortSignal) {
  signal.throwIfAborted();
  const data = isScriptSource(source)
    ? await dnsScriptProbe.read(source, signal)
    : await request<unknown>(`https://${cacheBuster()}.${source.host}${source.path}`, {
        signal,
        cache: 'no-store',
        credentials: 'omit',
      });
  signal.throwIfAborted();
  const resolvers = parseDnsResponse(source.name, data);
  if (!resolvers.length) throw new Error(t('未获取到 DNS 出口'));
  return { resolvers, client: parseDnsClient(source.name, data) };
}

export async function sampleDnsExit(signal: AbortSignal) {
  return (await sampleDnsSource(dnsSources[0], signal)).resolvers[0];
}

export type DnsProgress = {
  results: DnsExitHit[];
  clients: DnsExitHit[];
  count: number;
  failed: number;
  failures: Record<string, number>;
};

export const dnsSampleCount = dnsSources.reduce((total, source) => total + source.samples, 0);

const cloneHits = (hits: readonly DnsExitHit[]) =>
  hits.map((item) => ({
    ...item,
    sources: [...item.sources],
    sourceSamples: { ...item.sourceSamples },
  }));

function mergeHit(hits: DnsExitHit[], resolver: DnsResolver, source: string) {
  const found = hits.find((item) => item.ip === resolver.ip);
  if (!found) {
    hits.push({ ...resolver, samples: 1, sources: [source], sourceSamples: { [source]: 1 } });
    return;
  }
  found.samples += 1;
  found.sourceSamples[source] = (found.sourceSamples[source] ?? 0) + 1;
  if (!found.country_code && resolver.country_code) found.country_code = resolver.country_code;
  if (resolver.geo.length > found.geo.length) found.geo = resolver.geo;
  if (!found.sources.includes(source)) found.sources.push(source);
}

export async function detectDnsExits(
  signal: AbortSignal,
  onProgress: (state: DnsProgress) => void
) {
  let state: DnsProgress = { results: [], clients: [], count: 0, failed: 0, failures: {} };
  onProgress(state);
  const rounds = Math.max(...dnsSources.map((source) => source.samples));
  for (let round = 0; round < rounds; round++) {
    signal.throwIfAborted();
    await Promise.all(
      dnsSources
        .filter((source) => round < source.samples)
        .map(async (source) => {
          try {
            const sample = await sampleDnsSource(source, signal);
            const results = cloneHits(state.results);
            const clients = cloneHits(state.clients);
            for (const resolver of sample.resolvers) mergeHit(results, resolver, source.name);
            if (sample.client) mergeHit(clients, sample.client, source.name);
            state = { ...state, results, clients };
          } catch (error) {
            if (signal.aborted) throw error;
            state = {
              ...state,
              failed: state.failed + 1,
              failures: {
                ...state.failures,
                [source.name]: (state.failures[source.name] ?? 0) + 1,
              },
            };
          }
          signal.throwIfAborted();
          state = { ...state, count: state.count + 1 };
          onProgress(state);
        })
    );
  }
  if (!state.results.length) throw new Error(t('DNS 出口检测失败，可能受网络、代理或跨域限制'));
  return state;
}
