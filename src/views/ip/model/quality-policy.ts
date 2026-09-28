/** Versioned coverage requirements, not statistical confidence thresholds. */
export const QUALITY_POLICY_VERSION = 'indicator-model-v4';
export const REQUIRED_ANONYMITY_SOURCES = ['coffee', 'ipinfo', 'ipapi', 'proxycheck'] as const;

/**
 * Source weights describe how much a returned answer contributes to coverage.
 * They are deliberately separate from quality coefficients: a source can be
 * ready while answering only one of the indicators it exposes.
 */
export const QUALITY_COVERAGE_WEIGHTS: Record<string, number> = {
  coffee: 0.15,
  proxycheck: 0.12,
  ipqs: 0.12,
  abuseipdb: 0.12,
  ipinfo: 0.1,
  ip2location: 0.1,
  scamalytics: 0.1,
  ipregistry: 0.1,
  dnsbl: 0.1,
  ippure: 0.08,
  ipapi: 0.08,
  torexit: 0.06,
};

/**
 * A source is considered for an indicator only when its response model can
 * answer that indicator. This prevents a usage-only response from filling
 * coverage for fraud, abuse, or anonymity.
 */
export const INDICATOR_COVERAGE_SOURCES = {
  abuse: ['coffee', 'abuseipdb', 'ipregistry', 'dnsbl'],
  fraud: ['ipqs', 'scamalytics', 'proxycheck', 'ippure', 'ip2location'],
  anonymity: [
    'coffee',
    'ipinfo',
    'ip2location',
    'ipapi',
    'ipqs',
    'abuseipdb',
    'proxycheck',
    'torexit',
    'ipregistry',
  ],
  usage: [
    'coffee',
    'ipinfo',
    'ip2location',
    'ipapi',
    'ipqs',
    'abuseipdb',
    'proxycheck',
    'ipregistry',
  ],
  network: ['coffee', 'ipinfo', 'ip2location', 'ipapi', 'ipqs', 'proxycheck', 'ipregistry'],
  geo: ['coffee', 'ipinfo', 'ip2location', 'ipapi', 'ipregistry'],
  integrity: ['rdap'],
} as const;

/** Fetch-time evidence remains fresh for a week and is stale after 30 days. */
export const QUALITY_EVIDENCE_FRESH_DAYS = 7;
export const QUALITY_EVIDENCE_STALE_DAYS = 30;

export function evidenceAgeDays(checkedAt?: string, now = Date.now()): number | null {
  if (!checkedAt) return null;
  const timestamp = Date.parse(checkedAt);
  if (!Number.isFinite(timestamp) || !Number.isFinite(now)) return null;
  const age = (now - timestamp) / 86_400_000;
  return age < 0 ? null : age;
}

/**
 * Stale data should narrow its influence gradually, while very old data still
 * remains visible as a provisional observation instead of being discarded.
 */
export function evidenceFreshnessFactor(ageDays: number | null) {
  if (ageDays == null || ageDays <= QUALITY_EVIDENCE_FRESH_DAYS) return 1;
  if (ageDays >= QUALITY_EVIDENCE_STALE_DAYS) return 0.25;
  const span = QUALITY_EVIDENCE_STALE_DAYS - QUALITY_EVIDENCE_FRESH_DAYS;
  return 1 - (0.75 * (ageDays - QUALITY_EVIDENCE_FRESH_DAYS)) / span;
}

/** Sources whose data model only covers IPv4. */
const IPV4_ONLY_SOURCES = new Set(['ippure', 'dnsbl', 'torexit']);

export function reputationApplies(source: string, ip: string) {
  // The upstream adapter deliberately does not request IPv4-only feeds for IPv6.
  return !IPV4_ONLY_SOURCES.has(source) || !ip.includes(':');
}

export function qualityProfile(ip: string) {
  return ip.includes(':') ? ('ipv6-four-source' as const) : ('ipv4-five-source' as const);
}
