import type { MeasurementConfig } from '@cloudflare/speedtest';

import { parseTrace } from '@/lib/network';

import {
  ACCESS_VERSION,
  AIM_VERSION,
  EVIDENCE_TTL,
  type Evidence,
  type HttpSample,
  canonicalIp,
  sameIp,
  summarizeHttp,
} from './scenario-evidence.ts';
import type { ScenarioTarget } from './scenario-targets';

export const ACCESS_BUDGET_MS = 20_000;
export const QUALITY_MAX_BYTES = 66_600_000;

const ACCESS_REQUEST_MS = 1500;
const TRACE_TIMEOUT_MS = 3000;
const MAX_SAMPLES = 8;
const MAX_FAILURES = 2;
const WORKERS = 8;
const QUALITY_DEADLINE_MS = 120_000;
const SPEEDTRACE_ORIGIN = 'https://speed.cloudflare.com';

function newEvidence(ip: string, target: string, kind: Evidence['kind']): Evidence {
  const now = Date.now();
  return {
    kind,
    queriedIp: ip,
    target,
    source: kind === 'quality' ? AIM_VERSION : 'Browser Fetch',
    direction: 'browser-outbound',
    protocol: 'HTTPS',
    addressFamily: ip.includes(':') ? 'IPv6' : 'IPv4',
    startedAt: now,
    checkedAt: now,
    expiresAt: now + EVIDENCE_TTL,
    state: 'running',
    samples: [],
  };
}

async function traceExit(origin: string, signal: AbortSignal): Promise<string | undefined> {
  try {
    const response = await fetch(`${origin}/cdn-cgi/trace`, {
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      signal: AbortSignal.any([signal, AbortSignal.timeout(TRACE_TIMEOUT_MS)]),
    });
    if (!response.ok || new URL(response.url).origin !== origin) return;
    return parseTrace(await response.text()).ip;
  } catch {
    signal.throwIfAborted();
    return;
  }
}

interface AccessJob {
  target: ScenarioTarget;
  mode: RequestMode;
  failures: number;
  result: Evidence;
}

function outcomeOf(response: Response): HttpSample['outcome'] {
  if (response.type === 'opaque') return 'opaque';
  if (response.status === 429) return 'rate-limited';
  if (response.ok) return 'readable';
  return 'refused';
}

async function traceFrom(job: AccessJob, response: Response, sample: HttpSample) {
  const sameOrigin =
    job.target.trace &&
    response.ok &&
    response.type !== 'opaque' &&
    new URL(response.url).origin === new URL(job.target.url).origin;
  if (!sameOrigin) {
    await response.body?.cancel();
    return;
  }
  const trace = await response.text();
  const exit = trace.match(/^ip=(.+)$/m)?.[1]?.trim();
  if (!canonicalIp(exit)) return;
  sample.observedIp = exit;
  if (!job.result.egressBefore) {
    job.result.egressBefore = exit;
  } else {
    if (!sameIp(job.result.egressBefore, exit)) job.result.routeChanged = true;
    job.result.egressAfter = exit;
  }
  job.result.addressFamily = exit!.includes(':') ? 'IPv6' : 'IPv4';
}

async function sampleJob(job: AccessJob, batchSignal: AbortSignal, start: number) {
  const requestSignal = AbortSignal.any([batchSignal, AbortSignal.timeout(ACCESS_REQUEST_MS)]);
  try {
    const response = await fetch(job.target.url, {
      mode: job.mode,
      credentials: 'omit',
      cache: 'no-store',
      signal: requestSignal,
    });
    const sample: HttpSample = {
      elapsedMs: Math.round(performance.now() - start),
      ...(response.type !== 'opaque' ? { status: response.status } : {}),
      outcome: outcomeOf(response),
    };
    await traceFrom(job, response, sample);
    return sample;
  } catch {
    if (batchSignal.aborted) return undefined;
    // Discover a browser restriction once, never double every request.
    if (job.mode === 'cors' && !requestSignal.aborted) job.mode = 'no-cors';
    return {
      elapsedMs: Math.round(performance.now() - start),
      outcome: 'unknown',
      error: requestSignal.aborted ? 'timeout' : 'network',
    } as HttpSample;
  }
}

const doneWith = (sample: HttpSample, job: AccessJob) =>
  job.result.samples.length >= MAX_SAMPLES ||
  job.failures >= MAX_FAILURES ||
  sample.outcome === 'rate-limited' ||
  sample.outcome === 'refused';

// A shared queue gives every target its first sample before repeating fast targets.
export async function measurePlatforms(
  ip: string,
  targets: ScenarioTarget[],
  signal: AbortSignal,
  progress: (target: ScenarioTarget, value: Evidence) => void
): Promise<Record<string, Evidence>> {
  signal.throwIfAborted();
  const batchSignal = AbortSignal.any([signal, AbortSignal.timeout(ACCESS_BUDGET_MS)]);
  const unique = [...new Map(targets.map((target) => [target.url, target])).values()];

  const jobs: AccessJob[] = unique.map((target) => ({
    target,
    mode: target.trace || target.readable ? 'cors' : 'no-cors',
    failures: 0,
    result: {
      ...newEvidence(ip, target.url, 'http'),
      addressFamily: 'unknown',
      ruleVersion: ACCESS_VERSION,
    } as Evidence,
  }));

  const publish = (job: AccessJob) => {
    job.result.checkedAt = Date.now();
    job.result.expiresAt = job.result.checkedAt + EVIDENCE_TTL;
    progress(job.target, { ...job.result, samples: [...job.result.samples] });
  };
  jobs.forEach(publish);

  const queue = [...jobs];
  await Promise.all(
    Array.from({ length: Math.min(WORKERS, jobs.length) }, async () => {
      while (queue.length && !batchSignal.aborted) {
        const job = queue.shift()!;
        const sample = await sampleJob(job, batchSignal, performance.now());
        if (batchSignal.aborted || !sample) break;

        job.result.samples.push(sample);
        job.failures = sample.outcome === 'unknown' ? job.failures + 1 : 0;
        const finished = doneWith(sample, job);
        job.result.state = finished ? summarizeHttp(job.result.samples) : 'running';
        if (sample.outcome === 'refused') job.result.state = 'failed';
        publish(job);
        if (!finished) queue.push(job);
      }
    })
  );

  signal.throwIfAborted();
  for (const job of jobs) {
    if (job.result.state === 'running') {
      job.result.state = summarizeHttp(job.result.samples);
      job.result.incomplete = true;
      publish(job);
    }
  }
  return Object.fromEntries(jobs.map((job) => [job.target.url, job.result]));
}

export async function measurePlatform(
  ip: string,
  target: ScenarioTarget,
  signal: AbortSignal,
  progress: (value: Evidence) => void
): Promise<Evidence> {
  const results = await measurePlatforms(ip, [target], signal, (_, value) => progress(value));
  return results[target.url];
}

function qualityMeasurements(turnConfigured: boolean): MeasurementConfig[] {
  return [
    { type: 'latency', numPackets: 20 },
    ...(['download', 'upload'] as const).flatMap((type) =>
      [100_000, 1_000_000, 10_000_000].map((bytes) => ({ type, bytes, count: 3 }))
    ),
    ...(turnConfigured
      ? [
          {
            type: 'packetLoss' as const,
            numPackets: 100,
            batchSize: 10,
            batchWaitTime: 10,
            responsesWaitTime: 3000,
            connectionTimeout: 5000,
          },
        ]
      : []),
  ];
}

export async function measureQuality(
  ip: string,
  signal: AbortSignal,
  progress: (value: Evidence) => void
): Promise<Evidence> {
  const evidence = newEvidence(ip, 'speed.cloudflare.com', 'quality');
  evidence.ruleVersion = AIM_VERSION;
  evidence.egressBefore = await traceExit(SPEEDTRACE_ORIGIN, signal);
  if (evidence.egressBefore && !sameIp(evidence.egressBefore, ip)) {
    return { ...evidence, state: 'mismatch' };
  }

  const { default: SpeedTest } = await import('@cloudflare/speedtest');
  signal.throwIfAborted();

  const turnUri = import.meta.env.VITE_SPEEDTEST_TURN_URI?.trim();
  const credentialsUrl = import.meta.env.VITE_SPEEDTEST_TURN_CREDENTIALS_URL?.trim();
  const turnConfigured = Boolean(turnUri && credentialsUrl);
  const engine = new SpeedTest({
    autoStart: false,
    logMeasurementApiUrl: null,
    logAimApiUrl: null,
    includeCredentials: false,
    ...(turnConfigured ? { turnServerUri: turnUri, turnServerCredsApiUrl: credentialsUrl } : {}),
    measurements: qualityMeasurements(turnConfigured),
    bandwidthAbortRequestDuration: 10_000,
  });
  evidence.protocol = turnConfigured ? 'HTTPS + WebRTC/UDP' : 'HTTPS';

  const snapshot = (): Evidence => {
    const result = engine.results;
    const packet = result.getPacketLossDetails();
    return {
      ...evidence,
      metrics: result.getSummary(),
      raw: {
        latency: [...result.getUnloadedLatencyPoints()],
        downLoaded: [...result.getDownLoadedLatencyPoints()],
        upLoaded: [...result.getUpLoadedLatencyPoints()],
        download: result.getDownloadBandwidthPoints().map((point) => point.bps),
        upload: result.getUploadBandwidthPoints().map((point) => point.bps),
        ...('numMessagesSent' in (packet ?? {})
          ? {
              packetsSent: (packet as { numMessagesSent: number }).numMessagesSent,
              packetsLost: (packet as { lostMessages: number[] }).lostMessages,
            }
          : {}),
      },
      aimScores: engine.isFinished ? result.getScores() : undefined,
    };
  };

  const measured = await new Promise<Evidence>((resolve, reject) => {
    let settled = false;
    const settle = (value?: Evidence, error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      engine.onResultsChange = () => {};
      engine.onError = () => {};
      engine.pause();
      if (error) reject(error);
      else resolve(value!);
    };
    const abort = () =>
      settle(undefined, signal.reason ?? new DOMException('Aborted', 'AbortError'));
    const timer = setTimeout(
      () => settle({ ...snapshot(), state: 'partial', incomplete: true }),
      QUALITY_DEADLINE_MS
    );
    engine.onResultsChange = () => {
      if (!settled) progress(snapshot());
    };
    engine.onError = () => {
      evidence.incomplete = true;
    };
    engine.onFinish = () => settle({ ...snapshot(), state: 'complete' });
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    else engine.play();
  });

  measured.egressAfter = await traceExit(SPEEDTRACE_ORIGIN, signal);
  measured.checkedAt = Date.now();
  measured.expiresAt = measured.checkedAt + EVIDENCE_TTL;
  return measured;
}
