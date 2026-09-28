import { t } from '@/i18n';
import { anonymousNegative, typedAnonymousHit } from '@/views/ip/model/anonymity';
import { normCountry } from '@/views/ip/model/place';
import { type PrefixAge, prefixAgeDays } from '@/views/ip/model/prefix-age';
import {
  INDICATOR_COVERAGE_SOURCES,
  QUALITY_COVERAGE_WEIGHTS,
  QUALITY_EVIDENCE_FRESH_DAYS,
  QUALITY_EVIDENCE_STALE_DAYS,
  REQUIRED_ANONYMITY_SOURCES,
  evidenceAgeDays,
  evidenceFreshnessFactor,
  qualityProfile,
  reputationApplies,
} from '@/views/ip/model/quality-policy';
import { parseAbuseRaw } from '@/views/ip/model/scores';
import { usableScore } from '@/views/ip/model/verdict';

import type { CoffeeIp } from '../coffee';
import type { CrossPlace } from './cross-intel';
import type { QualityBand, SourceEvidence, UsageClass } from './quality';

/**
 * Multi-factor quality model.
 *
 * Seven indicators each carry a fixed coefficient; a missing indicator is
 * excluded and the remaining weights renormalize — missing is never "clean".
 * An eighth coefficient, evidence coverage E, is not a quality signal: it
 * scales how far the observed composite may travel from neutral.
 *
 *   B = Σ(wᵢ·xᵢ) / Σwᵢ     weighted mean over indicators with evidence
 *   P = Π pⱼ               multiplicative penalties (hard negative evidence)
 *   C = min cⱼ             hard ceilings (confirmed disqualifiers)
 *   E = weighted mean of answered/expected coverage per indicator; stale
 *       fetches reduce E; saturates at 0.75
 *   S = round(clamp(min(60 + min(1, E/0.75)·(B·P − 60), C), 0, 100))
 *
 * The shrinkage term keeps thin evidence from producing extreme scores in
 * either direction. Vendor bands and weights are site-specific heuristics,
 * not calibrated probabilities.
 */
export const QUALITY_INDICATORS = {
  abuse: 0.22,
  fraud: 0.18,
  anonymity: 0.16,
  usage: 0.14,
  network: 0.12,
  geo: 0.09,
  integrity: 0.09,
} as const;

export type IndicatorKey = keyof typeof QUALITY_INDICATORS;

/** Evidence coverage at which the score is fully trusted. */
export const EVIDENCE_SATURATION = 0.75;
/** Neutral prior the score shrinks toward as evidence thins out. */
export const EVIDENCE_PRIOR = 60;

const ABUSE_SOURCE_WEIGHTS: Record<string, number> = {
  dnsbl: 0.3,
  abuseipdb: 0.3,
  ipregistry: 0.2,
  coffee: 0.2,
};

const FRAUD_SOURCE_WEIGHTS: Record<string, number> = {
  ipqs: 0.3,
  scamalytics: 0.3,
  proxycheck: 0.2,
  ippure: 0.2,
  ip2location: 0.15,
};

/**
 * Missing-indicator anchors for the displayed range: pessimistic and
 * optimistic stand-ins for indicators no source answered. Neither "clean"
 * nor catastrophic — they bound what the evidence still allows.
 */
const MISSING_LO: Record<IndicatorKey, number> = {
  abuse: 20,
  fraud: 15,
  anonymity: 10,
  usage: 35,
  network: 40,
  geo: 30,
  integrity: 40,
};
const MISSING_HI: Record<IndicatorKey, number> = {
  abuse: 95,
  fraud: 92,
  anonymity: 94,
  usage: 100,
  network: 88,
  geo: 100,
  integrity: 95,
};

const USAGE_VALUE: Record<UsageClass, number> = {
  residential: 100,
  mobile: 95,
  isp: 88,
  'public-service': 78,
  org: 68,
  datacenter: 35,
};

export interface QualityIndicator {
  key: IndicatorKey;
  label: string;
  /** Configured coefficient. */
  weight: number;
  /** Coefficient renormalized over indicators that have evidence. */
  effective: number;
  score: number | null;
  sources: string[];
}

export interface QualityPenalty {
  key: string;
  label: string;
  factor: number;
}

/**
 * What the observed evidence still allows once missing indicators are
 * filled at their anchors. Collapses to a point at full coverage.
 */
export interface QualityRange {
  lo: number;
  hi: number;
}

export type EvidenceCoverage = Record<IndicatorKey, string[]>;

export interface QualityScore {
  value: number | null;
  band: QualityBand;
  bandLabel: string;
  reference: boolean;
  /** Abuse+fraud composite kept for the "信誉" display dimension. */
  reputation: number | null;
  anonymity: number | null;
  usage: number | null;
  indicators: QualityIndicator[];
  /** Weighted mean B before penalties and shrinkage. */
  base: number | null;
  /** B·P after multiplicative penalties, before evidence shrinkage. */
  adjusted: number | null;
  /** Post-shrinkage value before the hard ceiling. */
  uncapped: number | null;
  /** Evidence-bounded display interval; null when the score itself is null. */
  range: QualityRange | null;
  penalties: QualityPenalty[];
  evidenceCoverage: number;
  confidence: 'high' | 'medium' | 'low';
  freshnessDays: number | null;
  prefixRegisteredAt?: string;
  cap: number;
  sourcesUsed: number;
  evidence: EvidenceCoverage;
  status: 'ready' | 'provisional' | 'unavailable';
  effectiveWeights: Record<IndicatorKey, number>;
  missingSources: string[];
  profile: ReturnType<typeof qualityProfile>;
}

export function indicatorLabel(key: IndicatorKey) {
  if (key === 'abuse') return t('滥用记录');
  if (key === 'fraud') return t('欺诈风险');
  if (key === 'anonymity') return t('匿名暴露');
  if (key === 'usage') return t('用途属性');
  if (key === 'network') return t('网络归属');
  if (key === 'geo') return t('地理一致');
  return t('可溯源');
}

export function clampScore(value: number) {
  return Math.min(100, Math.max(0, value));
}

export function bandFromScore(score: number | null): QualityBand {
  if (score == null) return 'neutral';
  if (score >= 80) return 'good';
  if (score >= 60) return 'warn';
  if (score >= 40) return 'poor';
  return 'bad';
}

export function qualityBandLabel(band: QualityBand) {
  if (band === 'good') return t('比较好');
  if (band === 'warn') return t('需核实');
  if (band === 'poor') return t('较差');
  if (band === 'bad') return t('明显有问题');
  return t('数据不足');
}

/** Scamalytics: 0–19 allow, 20–59 challenge, 60–89 step-up, 90+ block. */
export function mapScamalyticsFraud(score: number) {
  if (score <= 19) return 92;
  if (score <= 59) return 62;
  if (score <= 89) return 32;
  return 12;
}

/** proxycheck.io: 0–25 low, 26–65 challenge, 66+ dangerous. */
export function mapProxycheckRisk(score: number) {
  if (score <= 25) return 92;
  if (score <= 65) return 55;
  return 18;
}

/** IP2Location has no published fraud bands; use the worker's 30 / 70 cuts. */
export function mapIp2LocationFraud(score: number) {
  if (score <= 30) return 92;
  if (score < 70) return 62;
  return 18;
}

/** IPQS fraud score: <75 low, 75–84 suspicious, 85–89 high risk, 90+ fraud. */
export function mapIpqsFraud(score: number) {
  if (score <= 74) return 92;
  if (score <= 84) return 62;
  if (score <= 89) return 32;
  return 12;
}

/** AbuseIPDB confidence: 0 means no abuse reports; 25+ is report-backed. */
export function mapAbuseIpdbConfidence(score: number) {
  if (score <= 0) return 95;
  if (score <= 25) return 70;
  if (score <= 75) return 35;
  return 15;
}

/**
 * DNSBL listings are per-zone votes, not a provider score. One stray
 * listing is common on low-signal zones; breadth across zones is the risk.
 * 97 − 21·listed − 40·(listed/answered) keeps the mapping continuous.
 */
export function mapDnsblBlocklist(listed: number, answered: number) {
  if (!Number.isFinite(listed) || !Number.isFinite(answered) || answered <= 0 || listed < 0)
    return null;
  if (listed === 0) return 97;
  return Math.round(clampScore(97 - 21 * listed - 40 * (listed / answered)));
}

export function mapPurity(score: number) {
  return clampScore(score);
}

/**
 * ipregistry reports flags, not a score: any abuser/attacker/threat mark
 * counts as flagged. A clean read is decent but shallow evidence.
 */
export function mapAbuseFlags(flagged: boolean) {
  return flagged ? 25 : 90;
}

/**
 * Coffee's abuse columns are rates or levels, not a 0–100 score; a raw
 * number below 1 is an abuse rate, not a percentage.
 */
export function coffeeAbuse(coffee: CoffeeIp): number | null {
  if (coffee.is_abuser === true) return 15;
  const level = coffee.intelligence?.abuser_level?.trim().toLowerCase();
  if (level === 'high') return 20;
  if (level === 'medium') return 45;
  const parsed = parseAbuseRaw(coffee.intelligence?.abuser_score_raw ?? coffee.abuser_score);
  const hundred = parsed.score != null && parsed.score >= 1 ? parsed.score : null;
  if (hundred != null && hundred >= 70) return 20;
  if (hundred != null && hundred >= 40) return 45;
  if (coffee.is_abuser === false || level === 'low' || level === 'safe' || parsed.score != null)
    return 90;
  return null;
}

/** Keep the exported name used by report/tests: coffee's overall read. */
export function coffeeReputation(coffee: CoffeeIp): number | null {
  const trust = usableScore(coffee.trust_score);
  const abuse = coffeeAbuse(coffee);
  if (trust == null && abuse == null) return null;
  if (abuse == null) return trust;
  if (trust == null) return abuse;
  return clampScore(Math.min(trust, abuse));
}

function weightedMean(parts: { weight: number; value: number }[], fallback: number | null = null) {
  let weight = 0;
  let sum = 0;
  for (const part of parts) {
    if (part.weight <= 0) continue;
    weight += part.weight;
    sum += part.weight * part.value;
  }
  return weight > 0 ? sum / weight : fallback;
}

function abuseSourceValue(source: SourceEvidence, coffee: CoffeeIp): number | null {
  if (source.id === 'coffee') return coffeeAbuse(coffee);
  const reputation = source.reputation;
  if (!reputation) return null;
  if (reputation.kind === 'blocklist')
    return mapDnsblBlocklist(reputation.listed, reputation.answered);
  if (reputation.kind === 'abuse') return mapAbuseFlags(reputation.flagged);
  // AbuseIPDB's confidence is an abuse-report verdict, not a fraud estimate.
  if (source.id === 'abuseipdb' && reputation.kind === 'fraud')
    return mapAbuseIpdbConfidence(reputation.raw);
  return null;
}

/**
 * Extreme-fraud posture shared by the score cap and the kind decision: how
 * many sources sit in the extreme tier, whether any other fraud/purity/risk
 * source reads clean enough (mapped ≥60) to rebut a lone verdict, and
 * whether a *different* provider corroborates with a typed anonymity hit —
 * a source cannot corroborate its own extreme verdict with its own flag.
 */
export interface FraudVerdict {
  extreme: number;
  rebutted: boolean;
  externalAnonHit: boolean;
}

export function fraudVerdict(sources: SourceEvidence[]): FraudVerdict {
  // AbuseIPDB's confidence is an abuse-report signal. It must never be
  // treated as an independent fraud verdict, even though its UI uses a
  // numeric confidence value and the shared source shape has a `fraud` kind.
  const fraudSources = sources.filter(
    (item) => item.id !== 'abuseipdb' && fraudSourceValue(item) != null
  );
  const extremeSources = fraudSources.filter((item) => item.extremeFraud);
  return {
    extreme: extremeSources.length,
    rebutted: fraudSources.some(
      (item) => !item.extremeFraud && (fraudSourceValue(item) ?? 0) >= 60
    ),
    externalAnonHit:
      extremeSources.length === 1 &&
      sources.some((item) => item.id !== extremeSources[0].id && typedAnonymousHit(item)),
  };
}

function fraudSourceValue(source: SourceEvidence): number | null {
  const reputation = source.reputation;
  if (!reputation || !('raw' in reputation) || !Number.isFinite(reputation.raw)) return null;
  if (source.id === 'abuseipdb') return null;
  if (reputation.kind === 'purity') return mapPurity(reputation.raw);
  if (reputation.kind === 'risk') return mapProxycheckRisk(reputation.raw);
  if (reputation.kind === 'fraud') {
    if (source.id === 'ipqs') return mapIpqsFraud(reputation.raw);
    if (source.id === 'ip2location') return mapIp2LocationFraud(reputation.raw);
    return mapScamalyticsFraud(reputation.raw);
  }
  return null;
}

/**
 * A detection is strong evidence; a clean read only covers what the source
 * checked. Flag hits therefore weigh 2.2× a full negative, a tor-only
 * negative (Tor list / AbuseIPDB) weighs 0.5, and hosting is excluded —
 * server infrastructure is not anonymization and belongs to the network
 * indicator instead.
 */
const ANON_FLAG_SCORE: [keyof SourceEvidence, number][] = [
  ['tor', 5],
  ['residentialProxy', 10],
  ['proxy', 25],
  ['vpn', 30],
  ['relay', 55],
];

function anonymityPart(source: SourceEvidence): { weight: number; value: number } | null {
  let worst: number | null = null;
  for (const [flag, score] of ANON_FLAG_SCORE)
    if (source[flag] === true) worst = worst == null ? score : Math.min(worst, score);
  if (source.untypedAnonymous) worst = worst == null ? 38 : Math.min(worst, 38);
  if (worst != null) {
    const weight = source.tor === true ? 3 : worst <= 38 ? 2.2 : worst <= 55 ? 1.2 : 0.8;
    return { weight, value: worst };
  }
  if (anonymousNegative(source)) return { weight: 1, value: 94 };
  if (source.tor === false) return { weight: 0.5, value: 92 };
  return null;
}

function usageScore(votes: UsageClass[], publicService: boolean) {
  if (!votes.length) return null;
  const mean = votes.reduce((sum, vote) => sum + USAGE_VALUE[vote], 0) / votes.length;
  return publicService ? Math.max(mean, 70) : mean;
}

function asnKindValue(kind?: string) {
  const key = kind?.trim().toLowerCase();
  if (!key) return null;
  if (/isp|fixed|broadband/.test(key)) return 88;
  if (/backbone|transit|mixed/.test(key)) return 78;
  if (/edu|school|university|gov/.test(key)) return 76;
  if (/business|enterprise|org|company/.test(key)) return 72;
  if (/cdn/.test(key)) return 64;
  if (/hosting|data|idc|cloud/.test(key)) return 45;
  return 70;
}

/**
 * Country-level agreement across geo databases. A single vote cannot be
 * verified (65); agreement scales 30–100 so split or anycast profiles read
 * as friction rather than fraud.
 */
function geoScore(coffee: CoffeeIp, places?: CrossPlace[] | null) {
  const countries: string[] = [];
  const own = normCountry(coffee.country ?? coffee.countryCode ?? '');
  if (own) countries.push(own);
  for (const place of places ?? []) {
    const code = normCountry(place?.country ?? '');
    if (code) countries.push(code);
  }
  if (!countries.length) return null;
  if (countries.length === 1) return 65;
  const buckets = new Map<string, number>();
  for (const code of countries) buckets.set(code, (buckets.get(code) ?? 0) + 1);
  const top = Math.max(...buckets.values());
  return Math.round(clampScore(30 + 70 * (top / countries.length)));
}

/**
 * Verifiable registration: the block exists in RDAP and carries a handle
 * and CIDR. Prefix age stays display context; it never moves the score.
 */
function integrityScore(prefix?: PrefixAge | null) {
  if (!prefix?.registeredAt || !Number.isFinite(Date.parse(prefix.registeredAt))) return null;
  let score = 82;
  if (prefix.handle) score += 8;
  if (prefix.cidr) score += 8;
  return clampScore(score);
}

export function collectUsageVotes(sources: SourceEvidence[]): UsageClass[] {
  // One provider contributes one usage reading. Company ownership is not an
  // additional, independent observation of how an address is connected.
  return sources.map((item) => item.usage).filter((value): value is UsageClass => value != null);
}

export function scoreQuality(
  coffee: CoffeeIp,
  sources: SourceEvidence[],
  options: {
    prefix?: PrefixAge | null;
    places?: CrossPlace[] | null;
    now?: number;
    checkedAt?: string;
    publicService?: boolean;
  } = {}
): QualityScore {
  const ready = sources.filter(
    (item) => item.status === 'ready' && reputationApplies(item.id, coffee.ip)
  );
  const sourcesUsed = ready.length;
  const freshnessDays = prefixAgeDays(options.prefix?.registeredAt, options.now);
  const evidence: EvidenceCoverage = {
    abuse: [],
    fraud: [],
    anonymity: [],
    usage: [],
    network: [],
    geo: [],
    integrity: [],
  };

  const abuseParts: { weight: number; value: number }[] = [];
  const fraudParts: { weight: number; value: number }[] = [];
  const anonymityParts: { weight: number; value: number }[] = [];
  const networkParts: { weight: number; value: number }[] = [];
  for (const source of ready) {
    const abuse = abuseSourceValue(source, coffee);
    if (abuse != null && ABUSE_SOURCE_WEIGHTS[source.id]) {
      abuseParts.push({
        weight: ABUSE_SOURCE_WEIGHTS[source.id],
        value: abuse,
      });
      evidence.abuse.push(source.id);
    }
    const fraud = fraudSourceValue(source);
    if (fraud != null && FRAUD_SOURCE_WEIGHTS[source.id]) {
      fraudParts.push({
        weight: FRAUD_SOURCE_WEIGHTS[source.id],
        value: fraud,
      });
      evidence.fraud.push(source.id);
    }
    const anon = anonymityPart(source);
    if (anon) {
      anonymityParts.push(anon);
      evidence.anonymity.push(source.id);
    }
    if (source.usage != null) evidence.usage.push(source.id);
  }

  const trust = usableScore(coffee.trust_score);
  if (trust != null) {
    networkParts.push({ weight: 0.45, value: trust });
    evidence.network.push('coffee');
  }
  const asnKind = asnKindValue(coffee.asn_kind);
  if (asnKind != null) {
    networkParts.push({ weight: 0.3, value: asnKind });
    if (!evidence.network.includes('coffee')) evidence.network.push('coffee');
  }
  const hostingHits = ready.filter((item) => item.hosting === true).length;
  const hostingNegs = ready.filter((item) => item.hosting === false).length;
  // A lone reporter cannot be a share of anything; one flag is a mild note.
  if (hostingHits + hostingNegs >= 2) {
    networkParts.push({
      weight: 0.25,
      value: 86 - (50 * hostingHits) / (hostingHits + hostingNegs),
    });
    for (const item of ready)
      if (item.hosting != null && !evidence.network.includes(item.id))
        evidence.network.push(item.id);
  } else if (hostingHits === 1) {
    networkParts.push({ weight: 0.25, value: 70 });
    const lone = ready.find((item) => item.hosting === true);
    if (lone && !evidence.network.includes(lone.id)) evidence.network.push(lone.id);
  } else if (hostingNegs === 1) {
    networkParts.push({ weight: 0.25, value: 84 });
    const lone = ready.find((item) => item.hosting === false);
    if (lone && !evidence.network.includes(lone.id)) evidence.network.push(lone.id);
  }

  const votes = collectUsageVotes(ready);
  const publicService = options.publicService === true || coffee.is_public_service === true;

  const geo = geoScore(coffee, options.places);
  if (geo != null) {
    if (coffee.country || coffee.countryCode) evidence.geo.push('coffee');
    for (const place of options.places ?? [])
      if (place?.country && !evidence.geo.includes(place.source)) evidence.geo.push(place.source);
  }
  const integrity = integrityScore(options.prefix);
  if (integrity != null) evidence.integrity.push('rdap');

  const scores: Record<IndicatorKey, number | null> = {
    abuse: weightedMean(abuseParts),
    fraud: weightedMean(fraudParts),
    anonymity: weightedMean(anonymityParts),
    usage: usageScore(votes, publicService),
    network: weightedMean(networkParts),
    geo,
    integrity,
  };

  const included = (Object.keys(QUALITY_INDICATORS) as IndicatorKey[]).filter(
    (key) => scores[key] != null
  );
  const includedWeight = included.reduce((sum, key) => sum + QUALITY_INDICATORS[key], 0);
  const effectiveWeights = Object.fromEntries(
    (Object.keys(QUALITY_INDICATORS) as IndicatorKey[]).map((key) => [
      key,
      scores[key] == null || includedWeight === 0 ? 0 : QUALITY_INDICATORS[key] / includedWeight,
    ])
  ) as Record<IndicatorKey, number>;
  const indicators = (Object.keys(QUALITY_INDICATORS) as IndicatorKey[]).map((key) => ({
    key,
    label: indicatorLabel(key),
    weight: QUALITY_INDICATORS[key],
    effective: effectiveWeights[key],
    score: scores[key],
    sources: evidence[key],
  }));

  const torListed = ready.some((item) => item.id === 'torexit' && item.tor === true);
  // Any typed Tor observation (Coffee flag, provider privacy field, or the
  // official exit list) is a hard signal, not a soft weighted vote.
  const torHit = ready.some((item) => item.tor === true) || coffee.is_tor === true;
  const typedYes = ready.filter(typedAnonymousHit).length;
  const anonNegatives = ready.filter(anonymousNegative).length;
  const { extreme, rebutted: fraudRebutted, externalAnonHit } = fraudVerdict(ready);
  const penalties: QualityPenalty[] = [];
  let penalty = 1;
  const apply = (key: string, label: string, factor: number) => {
    penalty *= factor;
    penalties.push({ key, label, factor });
  };
  if (torListed) apply('tor-exit', t('Tor 出口名单命中'), 0.12);
  if (scores.abuse != null && scores.abuse <= 20) apply('abuse-severe', t('滥用记录严重'), 0.55);
  if (scores.fraud != null && scores.fraud <= 15) apply('fraud-extreme', t('欺诈评分极端'), 0.6);
  if (scores.anonymity != null && scores.anonymity <= 25)
    apply('anonymity-severe', t('匿名暴露严重'), 0.7);
  // Detections only outweigh complete negatives when they are the majority;
  // a tie means the evidence is contested, not confirming.
  if (typedYes >= 2 && typedYes > anonNegatives)
    apply('anonymity-consensus', t('多源匿名检出'), 0.75);
  // An extreme fraud verdict alongside anonymity detection is suspicious —
  // but only while no other fraud source reads clean enough to rebut it.
  if (externalAnonHit && !fraudRebutted) apply('fraud-anonymity', t('极端欺诈叠加匿名检出'), 0.8);
  if (
    scores.anonymity != null &&
    scores.anonymity <= 35 &&
    scores.abuse != null &&
    scores.abuse <= 55
  )
    apply('dirty-anonymizer', t('匿名出口叠加滥用记录'), 0.75);

  let cap = 100;
  // The hard cap needs unrebutted evidence: a provider-level abuser flag,
  // two independent extreme verdicts, or one extreme verdict with no clean
  // fraud reading to rebut it plus anonymity corroboration elsewhere.
  if (
    coffee.is_abuser === true ||
    extreme >= 2 ||
    (extreme === 1 && !fraudRebutted && externalAnonHit)
  )
    cap = Math.min(cap, 25);
  if (torListed) cap = Math.min(cap, 15);
  if (torHit) cap = Math.min(cap, 25);
  if (ready.some((item) => item.residentialProxy)) cap = Math.min(cap, 35);
  if (scores.anonymity != null && scores.anonymity <= 15) cap = Math.min(cap, 40);
  if (scores.abuse != null && scores.abuse <= 15) cap = Math.min(cap, 30);
  if (scores.fraud != null && scores.fraud <= 12) cap = Math.min(cap, 30);

  /**
   * Coverage is measured per indicator. A ready source contributes only when
   * its parsed evidence actually answered that indicator; a source that
   * returned usage alone therefore cannot make fraud or anonymity complete.
   */
  const indicatorCoverage = {} as Record<IndicatorKey, number | null>;
  for (const key of Object.keys(QUALITY_INDICATORS) as IndicatorKey[]) {
    const expectedIds = new Set<string>(INDICATOR_COVERAGE_SOURCES[key]);
    if (key === 'integrity') {
      indicatorCoverage[key] = options.prefix && evidence.integrity.includes('rdap') ? 1 : null;
      continue;
    }
    const eligible = sources.filter(
      (item) =>
        expectedIds.has(item.id) &&
        reputationApplies(item.id, coffee.ip) &&
        item.status !== 'outbound' &&
        item.status !== 'not-applicable'
    );
    const expectedWeight = eligible.reduce(
      (sum, item) => sum + (QUALITY_COVERAGE_WEIGHTS[item.id] ?? 0),
      0
    );
    if (expectedWeight <= 0) {
      indicatorCoverage[key] = null;
      continue;
    }
    const answeredWeight = [...new Set(evidence[key])]
      .filter((id) => expectedIds.has(id))
      .reduce((sum, id) => sum + (QUALITY_COVERAGE_WEIGHTS[id] ?? 0), 0);
    indicatorCoverage[key] = Math.min(1, answeredWeight / expectedWeight);
  }
  const coverageKeys = (Object.keys(QUALITY_INDICATORS) as IndicatorKey[]).filter(
    (key) => indicatorCoverage[key] != null && scores[key] != null
  );
  const coverageWeight = coverageKeys.reduce((sum, key) => sum + QUALITY_INDICATORS[key], 0);
  const rawEvidenceCoverage =
    coverageWeight > 0
      ? coverageKeys.reduce(
          (sum, key) => sum + QUALITY_INDICATORS[key] * (indicatorCoverage[key] ?? 0),
          0
        ) / coverageWeight
      : 0;
  const checkedAtAgeDays = evidenceAgeDays(options.checkedAt, options.now);
  const evidenceCoverage = rawEvidenceCoverage * evidenceFreshnessFactor(checkedAtAgeDays);
  const saturation = Math.min(1, evidenceCoverage / EVIDENCE_SATURATION);

  const base =
    includedWeight > 0
      ? included.reduce((sum, key) => sum + effectiveWeights[key] * (scores[key] ?? 0), 0)
      : null;
  const adjusted = base == null ? null : base * penalty;
  const uncapped =
    adjusted == null ? null : EVIDENCE_PRIOR + saturation * (adjusted - EVIDENCE_PRIOR);

  const expectedReputation = [
    ...Object.keys(ABUSE_SOURCE_WEIGHTS),
    ...Object.keys(FRAUD_SOURCE_WEIGHTS),
  ].filter(
    (id, index, all) =>
      all.indexOf(id) === index &&
      reputationApplies(id, coffee.ip) &&
      !sources.some((source) => source.id === id && source.status === 'outbound')
  );
  const missingReputation = expectedReputation.filter(
    (id) => !evidence.abuse.includes(id) && !evidence.fraud.includes(id)
  );
  const missingSources = [
    ...new Set([
      ...sources
        .filter(
          (source) =>
            reputationApplies(source.id, coffee.ip) &&
            (source.status === 'unavailable' || source.status === 'pending')
        )
        .map((source) => source.id),
      ...missingReputation,
      ...REQUIRED_ANONYMITY_SOURCES.filter((id) => !evidence.anonymity.includes(id)),
    ]),
  ].sort();

  // Usage class or geography alone cannot fabricate a quality score; at
  // least one evidence-bearing indicator must be observed.
  const qualityEvidence =
    scores.abuse != null ||
    scores.fraud != null ||
    scores.anonymity != null ||
    scores.network != null ||
    scores.integrity != null;
  const value =
    uncapped == null || !qualityEvidence ? null : Math.round(clampScore(Math.min(uncapped, cap)));
  // The display range asks what the same pipeline yields when each missing
  // indicator is filled at its pessimistic/optimistic anchor. Evidence
  // penalties and ceilings apply to both bounds; the neutral shrinkage does
  // not — thin coverage must widen the interval, not hide it.
  const boundWith = (anchors: Record<IndicatorKey, number>) => {
    const filled = weightedMean(
      (Object.keys(QUALITY_INDICATORS) as IndicatorKey[]).map((key) => ({
        weight: QUALITY_INDICATORS[key],
        value: scores[key] ?? anchors[key],
      }))
    );
    return filled == null ? null : Math.round(clampScore(Math.min(filled * penalty, cap)));
  };
  const lo = value == null ? null : boundWith(MISSING_LO);
  const hi = value == null ? null : boundWith(MISSING_HI);
  const range =
    lo == null || hi == null
      ? null
      : { lo: Math.min(lo, value ?? lo), hi: Math.max(hi, value ?? hi) };
  const criticalKeys = ['abuse', 'fraud', 'anonymity', 'usage'] as const;
  const criticalCoverage = criticalKeys
    .map((key) => indicatorCoverage[key])
    .filter((value): value is number => value != null);
  const weakestCritical = criticalCoverage.length > 0 ? Math.min(...criticalCoverage) : 0;
  const confidence =
    checkedAtAgeDays != null && checkedAtAgeDays > QUALITY_EVIDENCE_FRESH_DAYS
      ? checkedAtAgeDays >= QUALITY_EVIDENCE_STALE_DAYS
        ? 'low'
        : 'medium'
      : evidenceCoverage >= EVIDENCE_SATURATION && weakestCritical >= 0.6
        ? 'high'
        : evidenceCoverage >= 0.45 && weakestCritical >= 0.25
          ? 'medium'
          : 'low';
  // Provider count describes coverage, not independence or confidence.
  const reference =
    value == null ||
    missingSources.length > 0 ||
    saturation < 1 ||
    indicators.some(
      (indicator) =>
        indicator.score == null && indicator.key !== 'geo' && indicator.key !== 'integrity'
    ) ||
    (['abuse', 'fraud', 'anonymity', 'usage'] as IndicatorKey[]).some(
      (key) => scores[key] == null || evidence[key].length < 2
    ) ||
    sources.some(
      (source) =>
        source.status === 'pending' || source.status === 'unavailable' || source.reputationConflict
    ) ||
    (checkedAtAgeDays != null && checkedAtAgeDays > QUALITY_EVIDENCE_FRESH_DAYS);
  const band = bandFromScore(value);
  return {
    value,
    band,
    bandLabel: qualityBandLabel(band),
    reference,
    reputation: weightedMean(
      (['abuse', 'fraud'] as IndicatorKey[])
        .filter((key) => scores[key] != null)
        .map((key) => ({
          weight: QUALITY_INDICATORS[key],
          value: scores[key] ?? 0,
        }))
    ),
    anonymity: scores.anonymity,
    usage: scores.usage,
    indicators,
    base,
    adjusted,
    uncapped,
    range,
    penalties,
    evidenceCoverage,
    confidence,
    freshnessDays,
    prefixRegisteredAt: options.prefix?.registeredAt,
    cap,
    sourcesUsed,
    evidence,
    status: value == null ? 'unavailable' : reference ? 'provisional' : 'ready',
    effectiveWeights,
    missingSources,
    profile: qualityProfile(coffee.ip),
  };
}
