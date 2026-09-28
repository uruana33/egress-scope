import { useEffect, useRef, useState } from 'react';

import { HttpRequestError } from '@/lib/network';
import { runPing } from '@/views/ping/api';

import {
  AIM_VERSION,
  EVIDENCE_TTL,
  type Evidence,
  type HttpSample,
  sameIp,
  summarizeHttp,
} from './scenario-evidence';
import { measurePlatform, measureQuality } from './scenario-probes';
import type { ScenarioTarget } from './scenario-targets';

const cache = new Map<string, Evidence>();
const CACHE_LIMIT = 50;
const TICK_MS = 5000;

function blankEvidence(ip: string, key: string, target?: ScenarioTarget): Evidence {
  const startedAt = Date.now();
  const kind = key === 'quality' ? 'quality' : key === 'https' ? 'inbound' : 'http';
  return {
    kind,
    queriedIp: ip,
    target: target?.url ?? (key === 'quality' ? 'speed.cloudflare.com' : ip),
    source: key === 'https' ? 'Globalping' : key === 'quality' ? AIM_VERSION : 'Browser Fetch',
    direction: key === 'https' ? 'probe-inbound' : 'browser-outbound',
    protocol: 'HTTPS',
    addressFamily: ip.includes(':') ? 'IPv6' : 'IPv4',
    startedAt,
    checkedAt: startedAt,
    expiresAt: startedAt + EVIDENCE_TTL,
    state: 'running',
    samples: [],
  };
}

function outcomeOf(statusCode?: number): HttpSample['outcome'] {
  if (statusCode === 429) return 'rate-limited';
  if (statusCode && statusCode >= 400) return 'refused';
  if (statusCode && statusCode >= 200 && statusCode < 400) return 'readable';
  return 'unknown';
}

async function probeInbound(ip: string, base: Evidence, signal: AbortSignal): Promise<Evidence> {
  const measured = await runPing(
    { host: ip, protocol: 'https', regions: ['AS', 'EU', 'NA'], perRegion: 1 },
    signal
  );
  const samples: HttpSample[] = measured.results.map(({ result }) => ({
    elapsedMs: result.timings?.total ?? 0,
    status: result.statusCode,
    outcome: outcomeOf(result.statusCode),
  }));
  const mismatch =
    !sameIp(measured.target, ip) ||
    measured.results.some(
      (row) => row.result.resolvedAddress && !sameIp(row.result.resolvedAddress, ip)
    );
  const checkedAt = measured.reusedAt ?? Date.now();
  return {
    ...base,
    samples,
    checkedAt,
    expiresAt: checkedAt + EVIDENCE_TTL,
    state: mismatch ? 'mismatch' : summarizeHttp(samples),
  };
}

export function useScenarioEvidence(ip: string) {
  const prefix = `${ip}|`;
  const [records, setRecords] = useState<Record<string, Evidence>>(() =>
    Object.fromEntries(
      [...cache]
        .filter(([key, value]) => key.startsWith(prefix) && value.expiresAt > Date.now())
        .map(([key, value]) => [key.slice(prefix.length), value])
    )
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), TICK_MS);
    const invalidate = () => {
      controller.current?.abort();
      cache.clear();
      setRecords({});
      setBusy(null);
    };
    const connection = (navigator as Navigator & { connection?: EventTarget }).connection;
    window.addEventListener('online', invalidate);
    connection?.addEventListener('change', invalidate);
    return () => {
      clearInterval(tick);
      controller.current?.abort();
      controller.current = null;
      window.removeEventListener('online', invalidate);
      connection?.removeEventListener('change', invalidate);
    };
  }, [ip]);

  const cancel = () => {
    controller.current?.abort();
    if (busy)
      setRecords((previous) =>
        previous[busy]
          ? { ...previous, [busy]: { ...previous[busy], state: 'cancelled' } }
          : previous
      );
    setBusy(null);
  };

  const run = async (key: string, target?: ScenarioTarget) => {
    if (controller.current && !controller.current.signal.aborted) controller.current.abort();
    const control = new AbortController();
    controller.current = control;

    const initial = blankEvidence(ip, key, target);
    const update = (value: Evidence) => {
      if (!control.signal.aborted) setRecords((previous) => ({ ...previous, [key]: value }));
    };
    setBusy(key);
    update(initial);

    try {
      const result =
        key === 'quality'
          ? await measureQuality(ip, control.signal, update)
          : key === 'https'
            ? await probeInbound(ip, initial, control.signal)
            : await measurePlatform(ip, target!, control.signal, update);
      control.signal.throwIfAborted();
      update(result);
      if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
      cache.set(prefix + key, result);
    } catch (error) {
      if (!control.signal.aborted)
        update({
          ...initial,
          checkedAt: Date.now(),
          state:
            error instanceof HttpRequestError && error.status === 429
              ? 'rate-limited'
              : 'unverifiable',
        });
    } finally {
      if (controller.current === control) {
        setBusy(null);
        controller.current = null;
      }
    }
  };

  return { records, busy, now, run, cancel };
}
