export const EVIDENCE_TTL = 5 * 60_000;
export const AIM_VERSION = '@cloudflare/speedtest@1.13.0';
export const ACCESS_VERSION = 'http-access-v1';

export type EvidenceState =
  | 'unmeasured'
  | 'running'
  | 'complete'
  | 'partial'
  | 'failed'
  | 'rate-limited'
  | 'unverifiable'
  | 'mismatch'
  | 'expired'
  | 'cancelled';

export type AccessScope = 'ip' | 'different' | 'browser';

export type HttpSample = {
  elapsedMs: number;
  outcome: 'readable' | 'opaque' | 'refused' | 'rate-limited' | 'unknown';
  status?: number;
  error?: 'timeout' | 'network';
  observedIp?: string;
};

export type QualityMetrics = {
  latency?: number;
  jitter?: number;
  download?: number;
  upload?: number;
  downLoadedLatency?: number;
  upLoadedLatency?: number;
  packetLoss?: number;
};

export type Evidence = {
  kind: 'http' | 'quality' | 'inbound';
  queriedIp: string;
  target: string;
  source: string;
  direction: 'browser-outbound' | 'probe-inbound';
  protocol: string;
  addressFamily: 'IPv4' | 'IPv6' | 'unknown';
  startedAt: number;
  checkedAt: number;
  expiresAt: number;
  state: EvidenceState;
  egressBefore?: string;
  egressAfter?: string;
  routeChanged?: boolean;
  samples: HttpSample[];
  metrics?: QualityMetrics;
  raw?: {
    latency: number[];
    downLoaded: number[];
    upLoaded: number[];
    download: number[];
    upload: number[];
    packetsSent?: number;
    packetsLost?: number[];
  };
  aimScores?: Record<
    string,
    { classificationIdx: number; classificationName: string; points: number }
  >;
  ruleVersion?: string;
  incomplete?: boolean;
};

const RESPONDED = ['readable', 'opaque'];
const DENIED = ['refused', 'rate-limited'];
const DEAD = ['cancelled', 'failed', 'rate-limited'];
const STAR_BANDS: [number, number][] = [
  [150, 5],
  [300, 4],
  [600, 3],
  [1000, 2],
];
const AIM_NAMES = ['bad', 'poor', 'average', 'good', 'great'];
const MIN_RATING_SAMPLES = 3;
const COVERAGE_FLOOR = 0.6;
const MIN_COVERED = 3;

function medianOf(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  return Math.round((sorted[Math.floor(mid - 0.5)] + sorted[Math.floor(mid)]) / 2);
}

const starFor = (median: number | null, responses: number) => {
  if (median === null || responses < MIN_RATING_SAMPLES) return null;
  for (const [ceiling, stars] of STAR_BANDS) if (median <= ceiling) return stars;
  return 1;
};

const responded = (sample: HttpSample) =>
  RESPONDED.includes(sample.outcome) && Number.isFinite(sample.elapsedMs) && sample.elapsedMs >= 0;

export function accessRating(evidence: Evidence | undefined, ip: string, now = Date.now()) {
  const samples = evidence?.samples ?? [];
  const successful = samples.filter(responded);
  const median = medianOf(successful.map((sample) => sample.elapsedMs));
  const stale = !!evidence && now >= evidence.expiresAt;
  const mismatch =
    !!evidence &&
    (evidence.routeChanged ||
      [evidence.egressBefore, evidence.egressAfter].some((exit) => exit && !sameIp(exit, ip)));
  const attributed =
    !!evidence &&
    !mismatch &&
    sameIp(evidence.egressBefore, ip) &&
    sameIp(evidence.egressAfter, ip) &&
    successful.length >= 2 &&
    successful.every((sample) => sameIp(sample.observedIp, ip));
  const blocked =
    !evidence ||
    evidence.kind !== 'http' ||
    evidence.direction !== 'browser-outbound' ||
    evidence.ruleVersion !== ACCESS_VERSION ||
    !sameIp(evidence.queriedIp, ip) ||
    stale ||
    DEAD.includes(evidence.state) ||
    samples.some((sample) => DENIED.includes(sample.outcome));

  return {
    stars: blocked ? null : starFor(median, successful.length),
    median,
    responses: successful.length,
    total: samples.length,
    fluctuating: successful.length > 0 && successful.length < samples.length,
    scope: (attributed ? 'ip' : mismatch ? 'different' : 'browser') as AccessScope,
    stale,
  };
}

const quorum = (total: number) => Math.max(MIN_COVERED, Math.ceil(total * COVERAGE_FLOOR));

export function averageAccessRating(
  evidence: (Evidence | undefined)[],
  ip: string,
  now = Date.now()
) {
  const ratings = evidence
    .map((value) => accessRating(value, ip, now).stars)
    .filter((stars): stars is number => stars !== null);
  const enough = ratings.length >= quorum(evidence.length);
  const mean = ratings.reduce((sum, stars) => sum + stars, 0) / ratings.length;
  return {
    average: enough ? Math.round(mean * 10) / 10 : null,
    rated: ratings.length,
    total: evidence.length,
    required: quorum(evidence.length),
  };
}

const awaitingFirstSample = (value: Evidence) =>
  value.state === 'running' && !value.samples.length && !value.egressBefore && !value.egressAfter;

export function summarizeAccessScopes(
  evidence: (Evidence | undefined)[],
  ip: string,
  now = Date.now()
) {
  const scopes: Record<AccessScope, number> = {
    ip: 0,
    different: 0,
    browser: 0,
  };
  for (const value of evidence) {
    if (!value || awaitingFirstSample(value)) continue;
    const rating = accessRating(value, ip, now);
    if (!rating.stale) scopes[rating.scope]++;
  }
  return {
    ...scopes,
    measured: scopes.ip + scopes.different + scopes.browser,
  };
}

export function canonicalIp(value?: string) {
  if (!value) return null;
  try {
    if (value.includes(':')) {
      return new URL(`https://[${value.replace(/^\[|\]$/g, '')}]`).hostname;
    }
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) {
      const parts = value.split('.').map(Number);
      if (parts.every((part) => part <= 255)) return parts.join('.');
    }
  } catch {
    /* Not an IP address. */
  }
  return null;
}

export function sameIp(left?: string, right?: string) {
  const ip = canonicalIp(left);
  return ip !== null && ip === canonicalIp(right);
}

export function evidenceState(
  evidence: Evidence | undefined,
  queriedIp: string,
  now = Date.now()
): EvidenceState {
  if (!evidence) return 'unmeasured';
  if (!sameIp(evidence.queriedIp, queriedIp)) return 'mismatch';
  if (now >= evidence.expiresAt) return 'expired';
  if (['running', 'cancelled', 'rate-limited', 'mismatch'].includes(evidence.state)) {
    return evidence.state;
  }
  if (evidence.direction === 'browser-outbound') {
    if (!evidence.egressBefore || !evidence.egressAfter) return 'unverifiable';
    if (!sameIp(evidence.egressBefore, queriedIp) || !sameIp(evidence.egressAfter, queriedIp)) {
      return 'mismatch';
    }
  }
  return evidence.state;
}

export function summarizeHttp(samples: HttpSample[]) {
  const every = (outcome: string) => samples.every((sample) => sample.outcome === outcome);
  if (samples.some((sample) => sample.outcome === 'rate-limited')) return 'rate-limited' as const;
  if (!samples.length || every('unknown')) return 'unverifiable' as const;
  if (samples.length >= 2 && every('refused')) return 'failed' as const;
  if (samples.length >= 3 && every('readable')) return 'complete' as const;
  return 'partial' as const;
}

const SCENARIO_REQUIREMENTS: Record<string, (keyof QualityMetrics)[]> = {
  base: ['latency', 'packetLoss', 'downLoadedLatency', 'upLoadedLatency'],
  streaming: ['download'],
  rtc: ['jitter', 'upload', 'download'],
};

const metricGap = (metrics: QualityMetrics, key: keyof QualityMetrics) =>
  typeof metrics[key] !== 'number' ||
  !Number.isFinite(metrics[key]) ||
  metrics[key]! < 0 ||
  (key === 'packetLoss' && metrics[key]! > 1);

function evidenceGaps(evidence: Evidence, scenario: string) {
  const gaps: string[] = [];
  if ((evidence.raw?.latency.length ?? 0) < 10) gaps.push('latencySamples');
  if ((evidence.raw?.packetsSent ?? 0) < 100 || !Array.isArray(evidence.raw?.packetsLost)) {
    gaps.push('packetSamples');
  }
  if ((evidence.raw?.downLoaded.length ?? 0) < 3 || (evidence.raw?.upLoaded.length ?? 0) < 3) {
    gaps.push('loadedSamples');
  }
  if (scenario === 'streaming' && (evidence.raw?.download.length ?? 0) < 3) {
    gaps.push('downloadSamples');
  }
  if (scenario === 'rtc' && (evidence.raw?.upload.length ?? 0) < 3) {
    gaps.push('uploadSamples');
  }
  return gaps;
}

const aimScoreValid = (result?: {
  classificationIdx: number;
  classificationName: string;
  points: number;
}) =>
  !!result &&
  Number.isInteger(result.classificationIdx) &&
  AIM_NAMES[result.classificationIdx] === result.classificationName &&
  Number.isFinite(result.points);

export function qualityRating(
  evidence: Evidence | undefined,
  queriedIp: string,
  scenario: 'streaming' | 'gaming' | 'rtc',
  now = Date.now()
): { stars: number | null; missing: string[]; state: EvidenceState } {
  const state = evidenceState(evidence, queriedIp, now);
  const usable =
    !!evidence &&
    evidence.kind === 'quality' &&
    evidence.direction === 'browser-outbound' &&
    evidence.target === 'speed.cloudflare.com' &&
    state === 'complete' &&
    !evidence.incomplete &&
    evidence.ruleVersion === AIM_VERSION;
  if (!usable) {
    return {
      stars: null,
      missing: [],
      state: state === 'complete' ? 'partial' : state,
    };
  }

  const metrics = evidence!.metrics ?? {};
  // Explicitly gate missing packet loss: upstream AIM otherwise awards default points.
  const required = [...SCENARIO_REQUIREMENTS.base, ...(SCENARIO_REQUIREMENTS[scenario] ?? [])];
  const gaps: string[] = [
    ...required.filter((key) => metricGap(metrics, key)),
    ...evidenceGaps(evidence!, scenario),
  ];

  const result = evidence!.aimScores?.[scenario];
  if (!aimScoreValid(result)) gaps.push('aimScore');

  return {
    stars: gaps.length ? null : result!.classificationIdx + 1,
    missing: gaps,
    state: gaps.length ? 'partial' : state,
  };
}
