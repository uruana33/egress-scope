import type { SourceDefinition } from '@/lib/diagnostic-source';
import {
  type DiagnosticResult,
  classifyDiagnosticError,
  diagnosticResult,
} from '@/lib/diagnostics';
import { createConcurrencyLimiter, endpoint } from '@/lib/network';
import { executeSource } from '@/lib/source-probe';
import type { Geo } from '@/lib/types';

import { fetchBrowserIp, fetchDomesticIp, lookupGeo } from './geo-lookup.ts';

const diagnosticLimiter = createConcurrencyLimiter(8);
const STANDARD_PRIORITY = 5;

export const getMyIp = (signal?: AbortSignal) =>
  diagnosticLimiter.run(signal, () => endpoint<Geo>('/me', { signal }), STANDARD_PRIORITY);

export function getGeo(ip: string, signal?: AbortSignal, timeoutMs = 3000) {
  return lookupGeo(ip, signal, timeoutMs);
}

export function getDomesticIp(signal?: AbortSignal) {
  return diagnosticLimiter.run(signal, () => fetchDomesticIp(signal), STANDARD_PRIORITY);
}

export function getBrowserIp(version: 4 | 6, signal?: AbortSignal) {
  return diagnosticLimiter.run(signal, () => fetchBrowserIp(version, signal), STANDARD_PRIORITY);
}

export type Site = SourceDefinition;

export function detectSite(site: Site, signal?: AbortSignal) {
  return diagnosticLimiter.run(signal, () => executeSource(site, signal), 8);
}

const LINK_ONLY_RESULT = {
  status: 'unsupported' as const,
  latencyMs: 0,
  queueWaitMs: 0,
  networkMs: 0,
  totalMs: 0,
};

export async function detectSiteResult(
  site: Site,
  runId: string,
  signal?: AbortSignal
): Promise<DiagnosticResult> {
  const context = {
    runId,
    sourceId: site.id,
    runtime: 'browser' as const,
    execution: 'client-request' as const,
    subject: 'caller-egress' as const,
    provenance: 'observed' as const,
    verified: true,
  };
  signal?.throwIfAborted();
  if (site.execution === 'link-only') {
    return diagnosticResult(
      { ...context, verified: false, execution: 'link-only', provenance: 'declared' },
      { ...LINK_ONLY_RESULT, capturedAt: new Date().toISOString() }
    );
  }

  let queueWaitMs = 0;
  let networkMs = 0;
  const runAttempt = () => {
    const queuedAt = performance.now();
    return diagnosticLimiter.run(
      signal,
      async () => {
        const startedAt = performance.now();
        const timing = () => {
          queueWaitMs += Math.round(startedAt - queuedAt);
          networkMs += Math.round(performance.now() - startedAt);
          const totalMs = queueWaitMs + networkMs;
          return {
            latencyMs: totalMs,
            queueWaitMs,
            networkMs,
            totalMs,
            capturedAt: new Date().toISOString(),
          };
        };
        try {
          const geo = await executeSource(site, signal);
          return diagnosticResult(context, { status: 'ok', ip: geo.ip, ...timing() });
        } catch (error) {
          if (signal?.aborted) throw error;
          return diagnosticResult(
            { ...context, verified: false },
            { ...classifyDiagnosticError(error), ...timing() }
          );
        }
      },
      8
    );
  };

  const first = await runAttempt();
  if (first.status !== 'timeout' || signal?.aborted) return first;
  return runAttempt();
}
