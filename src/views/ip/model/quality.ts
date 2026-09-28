import { t } from '@/i18n';
import {
  type AnonymitySignals,
  anonymousHit,
  anonymousNegative,
  mergeAnonymity,
  readingAnonymity,
  typedAnonymousHit,
  unknownAnonymity,
} from '@/views/ip/model/anonymity';
import { type CatalogSourceId, sourceCatalog } from '@/views/ip/model/cross-checks';
import type { CrossIntel, CrossReading } from '@/views/ip/model/cross-intel';
import { type PublicServiceIdentity, identifyPublicService } from '@/views/ip/model/public-service';
import { reputationApplies } from '@/views/ip/model/quality-policy';
import {
  type EvidenceCoverage,
  type QualityScore,
  collectUsageVotes,
  fraudVerdict,
  scoreQuality,
} from '@/views/ip/model/quality-score';
import { type ScoreTone, parseAbuseRaw } from '@/views/ip/model/scores';
import { type TerminalEgressReading, sameIp } from '@/views/ip/model/terminal-egress';
import { usableScore, usageConflict } from '@/views/ip/model/verdict';

import type { CoffeeIp } from '../coffee';

export type QualityKind =
  | 'public-service'
  | 'high-risk'
  | 'vpn-exit'
  | 'anonymous-exit'
  | 'tor-exit'
  | 'relay-exit'
  | 'org'
  | 'residential-proxy'
  | 'datacenter'
  | 'mobile'
  | 'residential'
  | 'isp'
  | 'disputed'
  | 'unknown';

export type QualityBand = 'good' | 'warn' | 'poor' | 'disputed' | 'bad' | 'neutral';

export type UsageClass = 'residential' | 'isp' | 'mobile' | 'org' | 'datacenter' | 'public-service';

export type SourceReputation =
  | { kind: 'trust' | 'fraud' | 'risk' | 'purity'; raw: number }
  | { kind: 'blocklist'; listed: number; answered: number }
  | { kind: 'abuse'; flagged: boolean };

export type SourceStatus = 'ready' | 'pending' | 'unavailable' | 'outbound' | 'not-applicable';

export interface QualityDimension {
  id: 'network' | 'reputation' | 'runtime' | 'freshness';
  label: string;
  value: string;
  hint: string;
  tone: ScoreTone;
}

export interface SourceFact {
  label: string;
  tone: ScoreTone;
}

export type SourceHeadlineKind = 'score' | 'verdict' | 'action';

export interface SourceHeadline {
  kind: SourceHeadlineKind;
  value: string;
  caption: string;
  tone: ScoreTone;
}

export interface SourceRow {
  label: string;
  value: string;
  tone: ScoreTone;
}

export interface SourceEvidence extends AnonymitySignals {
  id: CatalogSourceId;
  name: string;
  href: string;
  metric: string;
  why: string;
  status: SourceStatus;
  facts: SourceFact[];
  headline: SourceHeadline;
  rows: SourceRow[];
  tone: ScoreTone;
  usage: UsageClass | null;
  usageConflict: boolean;
  reputation: SourceReputation | null;
  reputationConflict: boolean;
  extremeFraud: boolean;
  elevatedFraud: boolean;
}

export interface QualityAssessment {
  kind: QualityKind;
  kindLabel: string;
  band: QualityBand;
  bandLabel: string;
  summary: string;
  headline: string;
  shortSummary: string;
  tags: { label: string; tone: ScoreTone }[];
  keyEvidence: {
    title: string;
    rows: { source: string; value: string; tone: ScoreTone }[];
  };
  pending: boolean;
  sourcesReady: number;
  sourcesTotal: number;
  score: number | null;
  scoreReference: boolean;
  scoreStatus: QualityScore['status'];
  scoreMissingSources: string[];
  scoreProfile: QualityScore['profile'];
  evidence: EvidenceCoverage & { reputation: string[] };
  checkedAt?: string;
  scoreBreakdown: Pick<
    QualityScore,
    | 'reputation'
    | 'anonymity'
    | 'usage'
    | 'indicators'
    | 'base'
    | 'adjusted'
    | 'uncapped'
    | 'range'
    | 'penalties'
    | 'evidenceCoverage'
    | 'confidence'
    | 'freshnessDays'
    | 'prefixRegisteredAt'
    | 'cap'
  >;
  network: QualityDimension;
  reputation: QualityDimension;
  freshness?: QualityDimension;
  runtime?: QualityDimension;
  terminalIp?: string;
  publicService: PublicServiceIdentity | null;
  sources: SourceEvidence[];
}

/** Shared by the page and copied report so missing evidence stays explicit. */
export function qualityScoreNotice(assessment: QualityAssessment) {
  if (assessment.scoreStatus === 'ready')
    return assessment.scoreReference ? t('部分维度证据有限') : '';
  const names = assessment.sources
    .filter((source) => assessment.scoreMissingSources.includes(source.id))
    .map((source) => source.name);
  if (assessment.scoreStatus === 'unavailable') return t('尚未取得可评分的信誉或匿名信号');
  return names.length
    ? t('按已读证据估算；缺少 {0}', [names.join('、')])
    : t('按已读维度估算，未返回的字段保持未知');
}

const HOSTING_ORG =
  /digitalocean|amazon|\baws\b|google cloud|microsoft azure|\bazure\b|\bovh\b|hetzner|vultr|leaseweb|linode|\balibaba\b|tencent|huawei cloud/i;

function uniqueFacts(facts: SourceFact[]): SourceFact[] {
  const seen = new Set<string>();
  const items: SourceFact[] = [];
  for (const fact of facts) {
    if (!fact.label || seen.has(fact.label)) continue;
    seen.add(fact.label);
    items.push(fact);
  }
  return items;
}

function uniqueRows(rows: SourceRow[]): SourceRow[] {
  const seen = new Set<string>();
  const items: SourceRow[] = [];
  for (const row of rows) {
    const key = row.label;
    if (!row.value || seen.has(key)) continue;
    seen.add(key);
    items.push(row);
  }
  return items;
}

function yn(value: boolean) {
  return value ? t('是') : t('否');
}

function scoreHeadline(
  value: string,
  caption: string,
  polarity: 'high-good' | 'high-bad',
  tone: ScoreTone
): SourceHeadline {
  return {
    kind: 'score',
    value,
    caption: `${caption} · ${polarity === 'high-good' ? t('越高越好') : t('越高越危险')}`,
    tone,
  };
}

function flagsHero(flags: AnonymitySignals): {
  value: string;
  tone: ScoreTone;
} {
  const hits = [
    flags.vpn ? 'VPN' : '',
    flags.proxy ? t('代理') : '',
    flags.tor ? 'Tor' : '',
    flags.relay ? t('中继') : '',
    flags.residentialProxy ? t('住宅代理') : '',
  ].filter(Boolean);
  // The umbrella "anonymous" flag only labels what typed flags do not.
  if (!hits.length && flags.untypedAnonymous) hits.push(t('匿名出口（未分类型）'));
  if (hits.length)
    return {
      value: hits.join(' · '),
      tone: flags.tor || flags.residentialProxy ? 'bad' : 'warn',
    };
  if (anonymousNegative(flags)) return { value: t('已检测项目未检出'), tone: 'good' };
  return { value: t('匿名检测不完整'), tone: 'neutral' };
}

function flagRow(label: string, value: boolean | null, hitTone: ScoreTone = 'warn'): SourceRow {
  return {
    label,
    value: value == null ? t('未知') : yn(value),
    tone: value == null ? 'neutral' : value ? hitTone : 'good',
  };
}

function coffeeUsageRow(usage: ReturnType<typeof coffeeUsage>, d: CoffeeIp): SourceRow {
  if (usage === 'conflict')
    return {
      label: t('用途'),
      value: usageConflict(d).join(' · '),
      tone: 'warn',
    };
  if (usage === 'residential') return { label: t('用途'), value: t('家庭宽带'), tone: 'neutral' };
  if (usage === 'mobile') return { label: t('用途'), value: t('移动网络'), tone: 'neutral' };
  if (usage === 'datacenter') return { label: t('用途'), value: t('数据中心'), tone: 'warn' };
  if (usage === 'isp') return { label: t('用途'), value: t('ISP 网络'), tone: 'neutral' };
  if (usage === 'org') return { label: t('用途'), value: t('机构网络'), tone: 'neutral' };
  if (usage === 'public-service')
    return { label: t('用途'), value: t('公共服务'), tone: 'neutral' };
  const raw = d.company_type?.trim() || d.asn_kind?.trim();
  return { label: t('用途'), value: raw || t('未知'), tone: 'neutral' };
}

function coffeePresentation(d: CoffeeIp): {
  headline: SourceHeadline;
  rows: SourceRow[];
} {
  const trust = usableScore(d.trust_score);
  const fraud = coffeeFraud(d);
  const parsed = parseAbuseRaw(d.intelligence?.abuser_score_raw ?? d.abuser_score);
  const usage = coffeeUsage(d);
  const vpn = tri(d.is_vpn);
  const proxy = tri(d.is_proxy);
  const tor = tri(d.is_tor);
  const trustTone: ScoreTone =
    trust == null ? 'neutral' : trust >= 75 ? 'good' : trust >= 45 ? 'warn' : 'bad';
  const usageRow = coffeeUsageRow(usage, d);
  const headline: SourceHeadline =
    trust != null
      ? scoreHeadline(String(trust), t('信誉分'), 'high-good', trustTone)
      : {
          kind: 'verdict',
          value: usageRow.value,
          caption: t('信誉与用途'),
          tone: usageRow.tone,
        };

  const hits = [vpn ? 'VPN' : '', proxy ? t('代理') : '', tor ? 'Tor' : ''].filter(Boolean);
  const rows: SourceRow[] = [];
  if (parsed.score != null)
    rows.push({
      label: t('滥用'),
      value: parsed.band ? `${parsed.score} · ${parsed.band}` : String(parsed.score),
      tone: fraud.tone,
    });
  else if (d.is_abuser === true) rows.push({ label: t('滥用'), value: t('是'), tone: 'bad' });
  rows.push(usageRow);
  if (d.company_type) rows.push({ label: t('组织类型'), value: d.company_type, tone: 'neutral' });
  rows.push({
    label: t('匿名'),
    value: hits.length
      ? hits.join(' · ')
      : vpn === false && proxy === false && tor === false
        ? t('未检出')
        : '—',
    tone: tor
      ? 'bad'
      : hits.length
        ? 'warn'
        : vpn === false && proxy === false && tor === false
          ? 'good'
          : 'neutral',
  });
  const org = d.isp || d.asOrganization || d.asname;
  if (org)
    rows.push({
      label: t('运营商'),
      value: d.asn ? `AS${d.asn} · ${org}` : org,
      tone: 'neutral',
    });
  const loc = d.countryCode || d.country;
  const reg = d.registered_country_code || d.registered_country;
  if (
    loc &&
    reg &&
    loc.replace(/\s+/g, '').toUpperCase() !== String(reg).replace(/\s+/g, '').toUpperCase()
  )
    rows.push({
      label: t('注册国'),
      value: t('注册于 {0}，定位在 {1}', [reg, loc]),
      tone: 'warn',
    });
  return { headline, rows: uniqueRows(rows) };
}

function presentReadings(
  id: CatalogSourceId,
  metric: string,
  readings: CrossReading[]
): { headline: SourceHeadline; rows: SourceRow[] } {
  const fraud = readings.find((item) => item.metric === 'fraud');
  const risk = readings.find((item) => item.metric === 'risk');
  const purity = readings.find((item) => item.metric === 'purity');
  const blocklist = readings.find((item) => item.metric === 'blocklist');
  const privacy = readings.find((item) => item.metric === 'privacy' || item.metric === 'proxy');
  const usageReadings = readings.filter((item) => item.metric === 'usage');
  const usage = usageReadings[0];
  const flags = privacy ? readingAnonymity(privacy) : null;
  const rows: SourceRow[] = [];
  let headline: SourceHeadline | null = null;
  let scored: CrossReading | null = null;

  if (purity) {
    scored = purity;
    headline = scoreHeadline(purity.value, t('纯净度'), 'high-good', readingFraud(purity).tone);
  } else if (id === 'proxycheck' && risk) {
    scored = risk;
    headline = scoreHeadline(risk.value, t('风险分'), 'high-bad', readingFraud(risk).tone);
  } else if (fraud) {
    scored = fraud;
    headline = scoreHeadline(
      fraud.value,
      id === 'abuseipdb' ? t('滥用置信度') : t('欺诈分'),
      'high-bad',
      readingFraud(fraud).tone
    );
  } else if (risk) {
    scored = risk;
    headline = scoreHeadline(risk.value, t('风控值'), 'high-bad', readingFraud(risk).tone);
  } else if (blocklist) {
    const listed = Number.parseInt(blocklist.value, 10) || 0;
    headline = {
      kind: 'verdict',
      value: listed ? t('列入 {0} 个名单', [listed]) : t('未列入'),
      caption: t('滥用黑名单'),
      tone: blocklist.tone,
    };
  } else if (id === 'torexit' && privacy) {
    const listed = privacy.flags?.tor === true;
    headline = {
      kind: 'verdict',
      value: listed ? 'Tor' : t('未列入'),
      caption: t('Tor 出口名单'),
      tone: listed ? 'bad' : 'good',
    };
  } else if (flags) {
    const hero = flagsHero(flags);
    headline = {
      kind: 'verdict',
      value: hero.value,
      caption: metric,
      tone: hero.tone,
    };
  } else if (usage) {
    headline = {
      kind: 'verdict',
      value: [...new Set(usageReadings.map((item) => item.value))].sort().join(' · '),
      caption: t('用途类型'),
      tone: classifyUsage(usage.value) === 'datacenter' ? 'warn' : 'neutral',
    };
  } else {
    headline = {
      kind: 'verdict',
      value: '—',
      caption: metric,
      tone: 'neutral',
    };
  }

  if (flags) {
    if (id === 'ipapi') {
      rows.push({ label: t('匿名'), ...flagsHero(flags) });
    } else {
      if (flags.vpn != null) rows.push(flagRow('VPN', flags.vpn));
      if (flags.proxy != null) rows.push(flagRow(t('代理'), flags.proxy));
      if (flags.tor != null) rows.push(flagRow('Tor', flags.tor, 'bad'));
      if (flags.relay != null) rows.push(flagRow(t('中继'), flags.relay));
      if (flags.residentialProxy != null)
        rows.push(flagRow(t('住宅代理'), flags.residentialProxy, 'bad'));
    }
    const hosting =
      flags.hosting ?? (privacy?.hint === 'Hosting' || privacy?.hint === 'Server' ? true : null);
    if (hosting != null || id === 'ipinfo') rows.push(flagRow(t('托管'), hosting));
  }

  if (blocklist)
    rows.push({
      label: t('黑名单'),
      value: blocklist.hint ? `${blocklist.value} · ${blocklist.hint}` : blocklist.value,
      tone: blocklist.tone,
    });

  const abuse = readings.find((item) => item.metric === 'abuse');
  if (abuse)
    rows.push({
      label: t('滥用标记'),
      value: abuse.value === 'Yes' ? t('已标记') : t('未标记'),
      tone: abuse.tone,
    });

  if (id === 'abuseipdb' && fraud?.hint)
    rows.push({ label: t('举报'), value: fraud.hint, tone: 'neutral' });

  if (usage)
    rows.push({
      label: t('用途'),
      value: [...new Set(usageReadings.map((item) => item.value))].sort().join(' · '),
      tone: classifyUsage(usage.value) === 'datacenter' ? 'warn' : 'neutral',
    });

  if (fraud && fraud !== scored)
    rows.push({
      label: t('欺诈分'),
      value: fraud.value,
      tone: readingFraud(fraud).tone,
    });
  if (risk && risk !== scored)
    rows.push({
      label: id === 'proxycheck' ? t('风险分') : t('风控值'),
      value: risk.value,
      tone: readingFraud(risk).tone,
    });
  if (purity && purity !== scored)
    rows.push({
      label: t('纯净度'),
      value: purity.value,
      tone: readingFraud(purity).tone,
    });

  for (const reading of readings) {
    const hint = reading.hint?.trim();
    // Hints on score/blocklist readings carry evidence (zones, report
    // counts), not an operator name; only type readings hint at carriers.
    if (
      !hint ||
      /hosting|server|notserver/i.test(hint) ||
      (reading.metric !== 'usage' && reading.metric !== 'proxy' && reading.metric !== 'privacy')
    )
      continue;
    rows.push({
      label:
        reading.source === 'ip2location' && reading.metric === 'proxy' ? t('供应商') : t('运营商'),
      value: hint,
      tone: 'neutral',
    });
  }

  return { headline, rows: uniqueRows(rows) };
}

function presentOutbound(
  id: CatalogSourceId,
  metric: string
): { headline: SourceHeadline; rows: SourceRow[] } {
  const headline: SourceHeadline = {
    kind: 'action',
    value: t('去原站'),
    caption: metric,
    tone: 'neutral',
  };
  if (id === 'ipqs')
    return {
      headline,
      rows: [
        { label: t('欺诈分'), value: t('原站核对'), tone: 'neutral' },
        { label: 'VPN', value: t('原站核对'), tone: 'neutral' },
        { label: t('机器人'), value: t('原站核对'), tone: 'neutral' },
      ],
    };
  if (id === 'abuseipdb')
    return {
      headline,
      rows: [
        { label: t('置信度'), value: t('原站核对'), tone: 'neutral' },
        { label: t('举报'), value: t('原站核对'), tone: 'neutral' },
      ],
    };
  return { headline, rows: [] };
}

function presentGap(status: 'pending' | 'unavailable'): {
  headline: SourceHeadline;
  rows: SourceRow[];
} {
  if (status === 'pending')
    return {
      headline: {
        kind: 'verdict',
        value: '—',
        caption: t('读取中'),
        tone: 'neutral',
      },
      rows: [],
    };
  return {
    headline: {
      kind: 'verdict',
      value: '—',
      caption: t('未能读取'),
      tone: 'warn',
    },
    rows: [{ label: t('下一步'), value: t('去原站核对'), tone: 'warn' }],
  };
}

export function factLine(facts: SourceFact[]) {
  return facts.map((item) => item.label).join(' · ');
}

function tri(value?: boolean): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function looksHosting(name?: string) {
  return !!name?.trim() && HOSTING_ORG.test(name);
}

export function classifyUsage(value?: string): UsageClass | null {
  const text = value?.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const key = text.toLowerCase();
  if (/public service|公共服务/.test(key)) return 'public-service';
  if (/idc|dch|\bcdn\b|data\s*centre|data\s*center|datacenter|hosting|server|机房/.test(key))
    return 'datacenter';
  if (/\bmob\b|mobile|蜂窝|移动/.test(key)) return 'mobile';
  if (/家庭宽带|residential/.test(key)) return 'residential';
  if (/\bisp\b|fixed line/.test(key)) return 'isp';
  if (
    /edu|university|college|school|government|\bgov\b|business|corporate|enterprise|education/.test(
      key
    )
  )
    return 'org';
  return null;
}

function isResidentialProxy(value: string) {
  return /residential proxy|\bres\b/.test(value.toLowerCase());
}

function worstTone(tones: ScoreTone[]): ScoreTone {
  if (tones.includes('bad')) return 'bad';
  if (tones.includes('warn')) return 'warn';
  if (tones.includes('good')) return 'good';
  return 'neutral';
}

function bandLabel(band: QualityBand) {
  if (band === 'good') return t('比较好');
  if (band === 'warn') return t('需核实');
  if (band === 'poor') return t('较差');
  if (band === 'disputed') return t('有争议');
  if (band === 'bad') return t('明显有问题');
  return t('数据不足');
}

function kindLabel(kind: QualityKind) {
  if (kind === 'public-service') return t('公共服务');
  if (kind === 'high-risk') return t('高风险 IP');
  if (kind === 'vpn-exit') return t('VPN 出口');
  if (kind === 'anonymous-exit') return t('匿名出口特征');
  if (kind === 'tor-exit') return t('Tor 出口特征');
  if (kind === 'relay-exit') return t('中继出口特征');
  if (kind === 'org') return t('机构网络');
  if (kind === 'residential-proxy') return t('住宅代理');
  if (kind === 'datacenter') return t('数据中心');
  if (kind === 'mobile') return t('移动网络');
  if (kind === 'residential') return t('住宅网络特征');
  if (kind === 'isp') return t('ISP 网络');
  if (kind === 'disputed') return t('来源存在分歧');
  return t('未知');
}

function coffeeUsage(d: CoffeeIp): UsageClass | 'conflict' | null {
  if (d.is_public_service === true) return 'public-service';
  if (usageConflict(d).length > 1) return 'conflict';
  if (d.isResidential === true) return 'residential';
  if (d.is_mobile === true) return 'mobile';
  if (d.is_datacenter === true) return 'datacenter';
  return classifyUsage(d.company_type) ?? classifyUsage(d.asn_kind);
}

function coffeeFacts(d: CoffeeIp): SourceFact[] {
  const facts: SourceFact[] = [];
  const trust = usableScore(d.trust_score);
  if (trust != null) {
    facts.push({
      label: t('信誉 {0}', [trust]),
      tone: trust >= 75 ? 'good' : trust >= 45 ? 'warn' : 'bad',
    });
  }
  const fraud = coffeeFraud(d);
  const parsed = parseAbuseRaw(d.intelligence?.abuser_score_raw ?? d.abuser_score);
  if (parsed.score != null) facts.push({ label: t('滥用 {0}', [parsed.score]), tone: fraud.tone });
  const usage = coffeeUsage(d);
  if (usage === 'conflict') {
    for (const flag of usageConflict(d)) facts.push({ label: flag, tone: 'warn' });
  } else if (usage === 'residential') facts.push({ label: t('家庭宽带'), tone: 'neutral' });
  else if (usage === 'mobile') facts.push({ label: t('移动网络'), tone: 'neutral' });
  else if (usage === 'datacenter') facts.push({ label: t('数据中心'), tone: 'warn' });
  else if (usage === 'isp') facts.push({ label: t('ISP 网络'), tone: 'neutral' });
  else if (usage === 'org') facts.push({ label: t('机构网络'), tone: 'neutral' });
  else if (usage === 'public-service') facts.push({ label: t('公共服务'), tone: 'neutral' });
  const vpn = tri(d.is_vpn);
  const proxy = tri(d.is_proxy) === true || tri(d.is_tor) === true;
  if (vpn === false && tri(d.is_proxy) === false && tri(d.is_tor) === false)
    facts.push({ label: t('未检出 VPN / 代理 / Tor'), tone: 'good' });
  else if (vpn || proxy) {
    if (vpn) facts.push({ label: 'VPN', tone: 'warn' });
    if (tri(d.is_proxy)) facts.push({ label: t('代理'), tone: 'warn' });
    if (tri(d.is_tor)) facts.push({ label: 'Tor', tone: 'bad' });
  }
  if (d.isp) facts.push({ label: d.isp, tone: 'neutral' });
  else if (d.asOrganization) facts.push({ label: d.asOrganization, tone: 'neutral' });
  return uniqueFacts(facts);
}

function coffeeFraud(d: CoffeeIp) {
  const parsed = parseAbuseRaw(d.intelligence?.abuser_score_raw ?? d.abuser_score);
  const score = parsed.score;
  const flagged = d.is_abuser === true;
  return {
    elevated: flagged || (score != null && score >= 40),
    extreme: flagged || (score != null && score >= 70),
    tone: (flagged || (score != null && score >= 70)
      ? 'bad'
      : score != null && score >= 40
        ? 'warn'
        : score != null
          ? 'good'
          : 'neutral') as ScoreTone,
  };
}

function readingScore(reading: CrossReading) {
  if (!reading.value.trim()) return null;
  return usableScore(Number(reading.value));
}

function readingFraud(reading: CrossReading) {
  const score = readingScore(reading);
  if (score == null) return { elevated: false, extreme: false, tone: 'neutral' as ScoreTone };
  // AbuseIPDB's confidence is based on abuse reports. Keep its display tone,
  // but do not let it enter the generic fraud extreme/elevated tiers.
  if (reading.source === 'abuseipdb' && reading.metric === 'fraud')
    return {
      elevated: false,
      extreme: false,
      tone: reading.tone,
    };
  if (reading.metric === 'purity')
    return {
      elevated: score < 80,
      extreme: score < 60,
      tone: (score >= 80 ? 'good' : score >= 60 ? 'warn' : 'bad') as ScoreTone,
    };
  if (reading.metric === 'risk') {
    if (reading.source === 'proxycheck')
      return {
        elevated: score >= 26,
        extreme: score >= 66,
        tone: (score <= 25 ? 'good' : score < 66 ? 'warn' : 'bad') as ScoreTone,
      };
    return {
      elevated: score >= 50,
      extreme: score >= 70,
      tone: (score <= 50 ? 'good' : score < 70 ? 'warn' : 'bad') as ScoreTone,
    };
  }
  if (reading.metric === 'fraud')
    return {
      elevated: score >= 60,
      extreme: score >= 90,
      tone: (score <= 19 ? 'good' : score < 60 ? 'warn' : 'bad') as ScoreTone,
    };
  return { elevated: false, extreme: false, tone: 'neutral' as ScoreTone };
}

function factsFromReadings(readings: CrossReading[]): SourceFact[] {
  const facts: SourceFact[] = [];
  for (const reading of readings) {
    const value = reading.value.replace(/\s+/g, ' ').trim();
    if (reading.metric === 'fraud')
      facts.push({
        label: `${t('欺诈分')} ${value}`,
        tone: readingFraud(reading).tone,
      });
    else if (reading.metric === 'risk')
      facts.push({
        label: `${reading.source === 'proxycheck' ? t('风险分') : t('风控值')} ${value}`,
        tone: readingFraud(reading).tone,
      });
    else if (reading.metric === 'purity')
      facts.push({
        label: `${t('纯净度')} ${value}`,
        tone: readingFraud(reading).tone,
      });
    else if (reading.metric === 'privacy' || reading.metric === 'proxy') {
      const flags = readingAnonymity(reading);
      const hero = flagsHero(flags);
      facts.push({ label: hero.value, tone: hero.tone });
      if (anonymousHit(flags) && value !== hero.value)
        facts.push({ label: value, tone: hero.tone });
    } else if (reading.metric === 'blocklist')
      facts.push({ label: `${t('黑名单')} ${value}`, tone: reading.tone });
    else if (reading.metric === 'abuse')
      facts.push({
        label: value === 'Yes' ? t('滥用标记') : t('未标记滥用'),
        tone: reading.tone,
      });
    else
      facts.push({
        label: value,
        tone: classifyUsage(value) === 'datacenter' ? 'warn' : 'neutral',
      });
    if (reading.hint === 'Hosting') facts.push({ label: t('托管'), tone: 'warn' });
    else if (reading.hint === 'Server') facts.push({ label: t('托管'), tone: 'warn' });
    else if (reading.hint && !/hosting|server|notserver/i.test(reading.hint)) {
      const flags = readingAnonymity(reading);
      facts.push({
        label: reading.hint,
        tone:
          reading.metric === 'blocklist'
            ? reading.tone
            : flags.vpn || flags.proxy || isResidentialProxy(reading.value)
              ? 'warn'
              : 'neutral',
      });
    }
  }
  return uniqueFacts(facts);
}

function signalsFromReadings(readings: CrossReading[]) {
  const signals = { ...unknownAnonymity };
  const usages = new Set<UsageClass>();
  const reputations = new Map<string, SourceReputation>();
  let extremeFraud = false;
  let elevatedFraud = false;
  const tones: ScoreTone[] = [];

  for (const reading of readings) {
    if (reading.metric === 'privacy' || reading.metric === 'proxy') {
      const flags = readingAnonymity(reading);
      mergeAnonymity(signals, flags);
      tones.push(flagsHero(flags).tone);
    }
    if (reading.metric === 'usage') {
      const usage = classifyUsage(reading.value);
      if (usage) usages.add(usage);
      if (usage === 'datacenter') signals.hosting = true;
      if (/server/i.test(reading.value) || reading.hint === 'Server') signals.hosting = true;
      tones.push(reading.tone);
    }
    if (reading.hint === 'Hosting' || reading.hint === 'Server') signals.hosting = true;
    if (reading.metric === 'fraud' || reading.metric === 'risk' || reading.metric === 'purity') {
      const fraud = readingFraud(reading);
      elevatedFraud ||= fraud.elevated;
      extremeFraud ||= fraud.extreme;
      tones.push(fraud.tone);
      const raw = readingScore(reading);
      if (raw != null)
        reputations.set(`${reading.metric}:${raw}`, {
          kind: reading.metric,
          raw,
        });
    }
    if (reading.metric === 'blocklist') {
      const [listed, answered] = reading.value.split('/').map((part) => Number.parseInt(part, 10));
      if (Number.isFinite(listed) && Number.isFinite(answered) && answered > 0) {
        tones.push(reading.tone);
        reputations.set(`blocklist:${listed}/${answered}`, {
          kind: 'blocklist',
          listed,
          answered,
        });
      }
    }
    if (reading.metric === 'abuse') {
      tones.push(reading.tone);
      reputations.set(`abuse:${reading.value}`, {
        kind: 'abuse',
        flagged: reading.value === 'Yes',
      });
    }
  }
  return {
    ...signals,
    usage: usages.size === 1 ? [...usages][0] : null,
    usageConflict: usages.size > 1,
    reputation: reputations.size === 1 ? [...reputations.values()][0] : null,
    reputationConflict: reputations.size > 1,
    extremeFraud: reputations.size > 1 ? false : extremeFraud,
    elevatedFraud: reputations.size > 1 ? false : elevatedFraud,
    tone: reputations.size > 1 ? ('warn' as ScoreTone) : worstTone(tones),
  };
}

function coffeeEvidence(d: CoffeeIp, href: string): Omit<SourceEvidence, 'metric' | 'why'> {
  const usage = coffeeUsage(d);
  const fraud = coffeeFraud(d);
  const hosting =
    d.is_datacenter === true ||
    classifyUsage(d.company_type) === 'datacenter' ||
    looksHosting(d.isp) ||
    looksHosting(d.asOrganization) ||
    looksHosting(d.company_name)
      ? true
      : d.is_datacenter === false
        ? false
        : null;
  const facts = coffeeFacts(d);
  const trust = usableScore(d.trust_score);
  const card = coffeePresentation(d);
  return {
    id: 'coffee',
    name: 'Net.Coffee',
    href,
    status:
      usage != null ||
      trust != null ||
      coffeeFraud(d).elevated ||
      [d.is_vpn, d.is_proxy, d.is_tor, d.is_datacenter].some((flag) => typeof flag === 'boolean')
        ? 'ready'
        : 'unavailable',
    facts: facts.length ? facts : [{ label: t('已读取'), tone: 'neutral' }],
    headline: card.headline,
    rows: card.rows,
    tone: worstTone([
      fraud.tone,
      usage === 'conflict' || usage === 'datacenter' ? 'warn' : 'neutral',
      tri(d.is_vpn) || tri(d.is_proxy) || tri(d.is_tor)
        ? 'warn'
        : [d.is_vpn, d.is_proxy, d.is_tor].every((flag) => flag === false)
          ? 'good'
          : 'neutral',
    ]),
    ...unknownAnonymity,
    vpn: tri(d.is_vpn),
    proxy: tri(d.is_proxy),
    tor: tri(d.is_tor),
    hosting,
    usage: usage === 'conflict' ? null : usage,
    usageConflict: usage === 'conflict',
    reputation: trust != null ? { kind: 'trust', raw: trust } : null,
    reputationConflict: false,
    extremeFraud: fraud.extreme,
    elevatedFraud: fraud.elevated,
  };
}

function outboundFacts(id: CatalogSourceId) {
  if (id === 'ipqs')
    return t('请到原站查看 {0}', [t('Fraud Score、VPN、Proxy、Bot、Recent Abuse')]);
  if (id === 'abuseipdb') return t('请到原站查看 {0}', [t('Abuse Confidence、Reports')]);
  return t('请到原站查看 {0}', [t('核心检测结果')]);
}

const silentSignals = {
  ...unknownAnonymity,
  usage: null as UsageClass | null,
  usageConflict: false,
  reputation: null as SourceEvidence['reputation'],
  reputationConflict: false,
  extremeFraud: false,
  elevatedFraud: false,
  tone: 'neutral' as ScoreTone,
};

function buildSources(d: CoffeeIp, intel: CrossIntel | null, pending: boolean): SourceEvidence[] {
  const grouped = new Map<string, CrossReading[]>();
  for (const reading of intel?.readings ?? []) {
    const list = grouped.get(reading.source) ?? [];
    list.push(reading);
    grouped.set(reading.source, list);
  }
  const unavailable = new Set<string>(intel?.unavailable ?? []);

  return sourceCatalog(d.ip).map((def) => {
    if (def.id === 'coffee')
      return {
        ...coffeeEvidence(d, def.href),
        metric: def.metric,
        why: def.why,
      };

    if (!reputationApplies(def.id, d.ip))
      return {
        id: def.id,
        name: def.name,
        href: def.href,
        metric: def.metric,
        why: def.why,
        status: 'not-applicable' as const,
        ...silentSignals,
        facts: [{ label: t('该来源不支持 IPv6 评分'), tone: 'neutral' as const }],
        headline: {
          kind: 'verdict' as const,
          value: t('不适用'),
          caption: def.metric,
          tone: 'neutral' as const,
        },
        rows: [],
      };
    // Readings win over auto:false — a deployer-configured API key makes
    // outbound-only sources produce real data through the same payload.
    const readings = grouped.get(def.id) ?? [];
    if (readings.length) {
      const parsed = signalsFromReadings(readings);
      const card = presentReadings(def.id, def.metric, readings);
      return {
        id: def.id,
        name: def.name,
        href: def.href,
        metric: def.metric,
        why: def.why,
        status: 'ready' as const,
        facts: factsFromReadings(readings),
        headline: parsed.reputationConflict
          ? {
              kind: 'verdict',
              value: t('信誉读数冲突'),
              caption: def.metric,
              tone: 'warn',
            }
          : card.headline,
        rows: card.rows,
        ...parsed,
      };
    }
    // Outbound card only when the worker did not even try the source —
    // a keyed source that failed shows the honest unavailable gap instead.
    if (!def.auto && !unavailable.has(def.id))
      return {
        id: def.id,
        name: def.name,
        href: def.href,
        metric: def.metric,
        why: def.why,
        status: 'outbound' as const,
        facts: [{ label: outboundFacts(def.id), tone: 'neutral' }],
        ...presentOutbound(def.id, def.metric),
        ...silentSignals,
      };
    if (pending && !intel)
      return {
        id: def.id,
        name: def.name,
        href: def.href,
        metric: def.metric,
        why: def.why,
        status: 'pending' as const,
        facts: [{ label: t('正在读取…'), tone: 'neutral' }],
        ...presentGap('pending'),
        ...silentSignals,
      };
    const gap = unavailable.has(def.id) || intel ? 'unavailable' : 'pending';
    const reason = intel?.unavailableReasons?.[def.id];
    return {
      id: def.id,
      name: def.name,
      href: def.href,
      metric: def.metric,
      why: def.why,
      status: gap,
      facts: [
        {
          label:
            gap === 'unavailable'
              ? reason === 'quota'
                ? t('API 额度耗尽，去原站核对')
                : t('未能自动读取，去原站核对')
              : t('正在读取…'),
          tone: gap === 'unavailable' ? 'warn' : 'neutral',
        },
      ],
      ...presentGap(gap),
      ...silentSignals,
    };
  });
}

function names(sources: SourceEvidence[]) {
  return sources.map((item) => item.name).join('、');
}

function buildSummary(
  kind: QualityKind,
  sources: SourceEvidence[],
  coffee: CoffeeIp,
  terminal?: TerminalEgressReading | null,
  selfLookup = false,
  publicService: PublicServiceIdentity | null = null
) {
  const clauses: string[] = [];
  if (publicService) clauses.push(t('已按运营方公开记录识别为 {0}。', [publicService.label]));
  const hits = sources.filter(anonymousHit);
  const negatives = sources.filter(anonymousNegative);
  for (const source of hits) {
    clauses.push(t('{0} 标出 {1}', [source.name, flagsHero(source).value]));
  }
  if (negatives.length) clauses.push(t('{0} 在已检测项目中未检出匿名特征', [names(negatives)]));
  if (!hits.length && !negatives.length)
    clauses.push(t('匿名检测证据不足，不能判断是否为匿名出口'));
  if (hits.length && negatives.length) clauses.push(t('匿名检测存在分歧'));

  const conflict = usageConflict(coffee);
  if (conflict.length > 1) clauses.push(t('Net.Coffee 同时标出 {0}', [conflict.join(' · ')]));
  if (coffee.isResidential === true && classifyUsage(coffee.company_type) === 'org') {
    clauses.push(t('Net.Coffee 同时记录组织类型 {0}，实际接入用途待核实', [coffee.company_type]));
  }
  if (!publicService && usageDisputed(sources, coffee)) {
    for (const source of sources.filter((item) => item.usage != null || item.usageConflict)) {
      const value = source.rows.find((row) => row.label === t('用途'))?.value ?? source.usage!;
      clauses.push(t('{0} 用途标为 {1}', [source.name, value]));
    }
    clauses.push(t('用途存在分歧，暂不能确认家庭宽带'));
  }

  for (const source of sources) {
    if (source.reputationConflict) {
      clauses.push(t('{0} 的信誉读数冲突，未参与计分', [source.name]));
      continue;
    }
    if (!source.extremeFraud && !source.elevatedFraud) continue;
    const reputation = source.reputation;
    const label =
      reputation?.kind === 'purity'
        ? t('纯净度')
        : reputation?.kind === 'fraud'
          ? t('欺诈分')
          : reputation?.kind === 'risk'
            ? t('风险分')
            : t('滥用');
    const raw =
      reputation && 'raw' in reputation && reputation.kind !== 'trust' ? ` ${reputation.raw}` : '';
    clauses.push(`${source.name} ${label}${raw}`);
  }

  if (terminal?.ip) {
    if (terminal.distinctIps > 1)
      clauses.push(t('终端报告里出现 {0} 个出口，已采用 {1}', [terminal.distinctIps, terminal.ip]));
    if (sameIp(terminal.ip, coffee.ip)) clauses.push(t('终端出口与查询地址一致'));
    else if (selfLookup)
      clauses.push(t('终端出口为 {0}，与当前浏览器查询不是同一条路径', [terminal.ip]));
    else clauses.push(t('终端出口为 {0}，不是当前查询地址', [terminal.ip]));
  }

  const tail =
    kind === 'disputed'
      ? t('来源存在分歧，应结合各项证据核实。')
      : kind === 'vpn-exit' ||
          kind === 'anonymous-exit' ||
          kind === 'tor-exit' ||
          kind === 'relay-exit'
        ? t('已读取来源标出匿名或中继特征；这不等于恶意行为。')
        : kind === 'high-risk'
          ? t('已读取来源存在较强风险信号。')
          : kind === 'residential-proxy'
            ? t('命中住宅代理特征，ISP 名称不能当作普通家宽。')
            : kind === 'datacenter'
              ? t('已读取来源的用途指向数据中心。')
              : kind === 'residential'
                ? t('已读取来源标有住宅用途，实际接入类型仍需线路信息核实。')
                : kind === 'org'
                  ? t('已读取来源标为企业或教育等机构网络，不能据此当成家庭宽带。')
                  : kind === 'isp'
                    ? t('来源只标了 ISP，不能据此当成家庭宽带。')
                    : kind === 'mobile'
                      ? t('已读取来源标有移动运营商用途。')
                      : kind === 'public-service'
                        ? t('由公共服务商运营的地址，例如公共 DNS。')
                        : t('现有来源还不足以给出稳定结论。');

  const head = clauses.join(' · ');
  return head ? `${head}。${tail}` : tail;
}

function usageDisputed(sources: SourceEvidence[], coffee: CoffeeIp) {
  const votes = collectUsageVotes(sources);
  return (
    usageConflict(coffee).length > 1 ||
    sources.some((source) => source.usageConflict) ||
    (votes.includes('datacenter') &&
      votes.some((vote) => vote !== 'datacenter' && vote !== 'public-service')) ||
    (votes.includes('org') && votes.some((vote) => vote === 'residential' || vote === 'mobile')) ||
    (votes.includes('residential') && votes.includes('mobile'))
  );
}

function decideKind(
  sources: SourceEvidence[],
  coffee: CoffeeIp,
  publicService: boolean
): QualityKind {
  const typedYes = sources.filter(typedAnonymousHit).length;
  const negatives = sources.filter(anonymousNegative).length;
  const hits = sources.filter(anonymousHit);
  const verdict = fraudVerdict(sources);
  if (
    coffee.is_abuser === true ||
    verdict.extreme >= 2 ||
    (verdict.extreme === 1 && !verdict.rebutted && verdict.externalAnonHit)
  )
    return 'high-risk';
  if (sources.some((item) => item.residentialProxy)) return 'residential-proxy';
  if (sources.some((item) => item.tor)) return 'tor-exit';
  if (hits.length) {
    if (negatives > 0 && typedYes <= negatives) return 'disputed';
    if (hits.every((item) => item.relay && !item.vpn && !item.proxy && !item.untypedAnonymous))
      return 'relay-exit';
    if (hits.every((item) => item.vpn)) return 'vpn-exit';
    return 'anonymous-exit';
  }
  if (publicService) return 'public-service';
  if (usageDisputed(sources, coffee)) return 'disputed';
  const votes = collectUsageVotes(sources);
  if (votes.includes('datacenter')) return 'datacenter';
  if (votes.includes('org')) return 'org';
  if (votes.includes('mobile')) return 'mobile';
  if (votes.includes('residential')) return 'residential';
  if (votes.includes('isp')) return 'isp';
  return 'unknown';
}

function networkDimension(
  kind: QualityKind,
  sources: SourceEvidence[],
  coffee: CoffeeIp
): QualityDimension {
  const hit = sources.some(anonymousHit);
  const negative = sources.some(anonymousNegative);
  const conflict = usageDisputed(sources, coffee);
  const org = coffee.isp || coffee.asOrganization || coffee.asname;
  let value = t('未知');
  let tone: ScoreTone = 'neutral';
  if (['vpn-exit', 'anonymous-exit', 'tor-exit', 'relay-exit'].includes(kind)) {
    value = kindLabel(kind);
    tone = kind === 'tor-exit' ? 'bad' : 'warn';
  } else if (kind === 'disputed' && hit && negative) {
    value = t('匿名检测存在分歧');
    tone = 'warn';
  } else if (kind === 'disputed' || conflict) {
    value = t('用途存在分歧');
    tone = 'warn';
  } else if (kind === 'datacenter') {
    value = t('数据中心网络');
    tone = 'warn';
  } else if (kind === 'org') {
    value = t('机构网络');
  } else if (kind === 'mobile') {
    value = t('移动运营商网络');
    tone = 'good';
  } else if (kind === 'residential') {
    value = t('住宅网络特征');
    tone = 'good';
  } else if (kind === 'isp') {
    value = t('ISP 网络');
    tone = 'warn';
  } else if (kind === 'public-service') {
    value = t('公共服务');
  } else if (kind === 'residential-proxy') {
    value = t('住宅代理');
    tone = 'bad';
  }
  const hintParts = [
    [coffee.asn ? `AS${coffee.asn}` : '', org].filter(Boolean).join(' '),
    (kind === 'disputed' || kind === 'isp' || kind === 'residential-proxy') &&
      t('服务商名称不等于住宅 IP'),
  ].filter((part): part is string => !!part);
  return {
    id: 'network',
    label: t('网络'),
    value,
    hint: hintParts.join(' · '),
    tone,
  };
}

function conciseConclusion(kind: QualityKind, sources: SourceEvidence[], scored: QualityScore) {
  const hits = sources.filter(anonymousHit);
  const negative = sources.some(anonymousNegative);
  const org = sources.some((source) => source.usage === 'org');
  const lowRisk = scored.value != null && scored.value >= 80;
  let headline = kindLabel(kind);
  let shortSummary = t('现有记录可供参考，实际接入类型仍待核实。');
  if (kind === 'disputed') {
    headline = hits.length
      ? t('匿名特征需核实')
      : lowRisk
        ? t('风险较低，用途待核实')
        : t('用途存在分歧');
    shortSummary = hits.length
      ? t('部分来源标出匿名出口，检测结果尚未一致。')
      : org
        ? t('住宅与机构标记不一致，暂不能确认为家庭宽带。')
        : t('网络用途标记不一致，建议结合实际线路核实。');
  } else if (kind === 'high-risk') {
    headline = t('风险较高');
    shortSummary = t('已读记录存在较强风险信号，建议核实后使用。');
  } else if (kind === 'tor-exit') {
    shortSummary = t('检测到 Tor 出口特征，可能触发平台限制。');
  } else if (kind === 'residential-proxy') {
    shortSummary = t('检测到住宅代理特征，不能按普通家宽判断。');
  } else if (kind === 'vpn-exit' || kind === 'anonymous-exit') {
    shortSummary = t('检测到代理或 VPN 特征，平台接受程度可能不同。');
  } else if (kind === 'relay-exit') {
    shortSummary = t('检测到中继特征，不等于存在恶意行为。');
  } else if (kind === 'public-service') {
    headline = t('公共服务地址');
    shortSummary = t('已识别为公共服务端点，不用于判断家庭宽带质量。');
  } else if (kind === 'org') {
    shortSummary = t('用途标记偏向企业或教育等机构网络。');
  } else if (kind === 'datacenter') {
    shortSummary = t('用途标记偏向机房，适用性取决于目标平台。');
  } else if (kind === 'residential' || kind === 'mobile' || kind === 'isp') {
    shortSummary = negative
      ? t('已读来源未见明显匿名特征，接入类型仍以实际线路为准。')
      : t('已有接入类型线索，匿名状态仍待进一步核实。');
  } else {
    headline =
      scored.value == null
        ? t('正在了解这个 IP')
        : lowRisk
          ? t('当前风险信号较低')
          : t('建议进一步核实');
    shortSummary = t('先依据已读信号评估，网络用途尚未确认。');
  }
  const tags: QualityAssessment['tags'] = [];
  if (hits.length) tags.push({ label: t('{0} 家标出匿名特征', [hits.length]), tone: 'warn' });
  else if (negative) tags.push({ label: t('未检出代理特征'), tone: 'good' });
  else tags.push({ label: t('匿名状态待核实'), tone: 'neutral' });
  if (kind === 'disputed')
    tags.push({
      label: org && !hits.length ? t('家宽 / 机构分歧') : t('来源有分歧'),
      tone: 'warn',
    });
  else if (scored.reputation != null)
    tags.push({
      label: scored.reputation >= 80 ? t('信誉信号良好') : t('信誉需关注'),
      tone: scored.reputation >= 80 ? 'good' : 'warn',
    });
  return { headline, shortSummary, tags };
}

function keyEvidence(
  kind: QualityKind,
  sources: SourceEvidence[],
  publicService: PublicServiceIdentity | null
): QualityAssessment['keyEvidence'] {
  if (kind === 'high-risk') {
    return {
      title: t('主要风险信号'),
      rows: sources
        .filter((source) => source.extremeFraud || source.elevatedFraud)
        .slice(0, 3)
        .map((source) => ({
          source: source.name,
          value:
            source.id === 'coffee'
              ? t('滥用风险标记')
              : source.headline.kind === 'score'
                ? `${source.headline.caption.split(' · ')[0]} ${source.headline.value}`
                : source.headline.value,
          tone: 'bad',
        })),
    };
  }
  const anonymous = sources.filter(anonymousHit);
  if (anonymous.length) {
    const rows = anonymous
      .slice(0, 2)
      .map((source) => ({ source: source.name, ...flagsHero(source) }));
    const negative = sources.filter(anonymousNegative);
    if (negative.length)
      rows.push({
        source: negative.map((source) => source.name).join(' / '),
        value: t('已检测项目未检出'),
        tone: 'good',
      });
    return { title: t('匿名检测对照'), rows };
  }
  if (publicService)
    return {
      title: t('用途核对'),
      rows: [
        {
          source: publicService.provider,
          value: publicService.label,
          tone: 'neutral',
        },
      ],
    };
  const usage = sources.filter((source) => source.usage != null || source.usageConflict);
  if (usage.length)
    return {
      title: t('用途来源对照'),
      rows: usage.slice(0, 3).map((source) => {
        const raw = source.rows.find((row) => row.label === t('用途'))?.value;
        let value = raw ?? t('未知');
        if (source.usage === 'residential') value = t('住宅网络');
        else if (source.usage === 'org')
          value = /edu|university|college|school/i.test(raw ?? '')
            ? t('教育机构')
            : /business|corporate/i.test(raw ?? '')
              ? t('商业网络')
              : t('机构网络');
        else if (source.usage === 'datacenter') value = t('数据中心');
        else if (source.usage === 'mobile') value = t('移动网络');
        else if (source.usage === 'isp') value = t('ISP 网络');
        return {
          source: source.name,
          value,
          tone: source.usageConflict || kind === 'disputed' ? 'warn' : 'neutral',
        };
      }),
    };
  return {
    title: t('已读信誉依据'),
    rows: sources
      .filter((source) => source.reputation != null)
      .slice(0, 3)
      .map((source) => ({
        source: source.name,
        value: `${source.headline.caption.split(' · ')[0]} ${source.headline.value}`,
        tone: source.headline.tone,
      })),
  };
}

function reputationDimension(sources: SourceEvidence[], scored: QualityScore): QualityDimension {
  const reputationSources = new Set([...scored.evidence.abuse, ...scored.evidence.fraud]).size;
  if (scored.reputation == null)
    return {
      id: 'reputation',
      label: t('信誉'),
      value: t('证据不足'),
      hint: reputationSources
        ? t('信誉来源不完整，保留原始读数，暂停合成信誉维')
        : t('没有可用的信誉读数，未知不会计为低风险'),
      tone: 'neutral',
    };
  const r = Math.round(scored.reputation);
  const abuseScore = scored.indicators.find((item) => item.key === 'abuse')?.score;
  const fraudScore = scored.indicators.find((item) => item.key === 'fraud')?.score;
  const hint =
    abuseScore != null && fraudScore != null
      ? t('滥用 {0} · 欺诈 {1} 合成', [Math.round(abuseScore), Math.round(fraudScore)])
      : t('{0} 个信誉来源', [reputationSources]);
  if (r <= 25)
    return {
      id: 'reputation',
      label: t('信誉'),
      value: t('滥用风险偏高'),
      hint,
      tone: 'bad',
    };
  if (r < 60)
    return {
      id: 'reputation',
      label: t('信誉'),
      value: t('信誉偏低'),
      hint,
      tone: 'warn',
    };
  if (r < 80)
    return {
      id: 'reputation',
      label: t('信誉'),
      value: t('信誉一般'),
      hint,
      tone: 'warn',
    };
  if (sources.some((item) => item.status === 'ready' && item.reputation != null))
    return {
      id: 'reputation',
      label: t('信誉'),
      value: t('已读信誉信号较低风险'),
      hint,
      tone: 'good',
    };
  return {
    id: 'reputation',
    label: t('信誉'),
    value: t('需到原站核对欺诈分'),
    hint,
    tone: 'neutral',
  };
}

function freshnessDimension(scored: QualityScore): QualityDimension {
  const days = scored.freshnessDays;
  const registered = scored.prefixRegisteredAt?.slice(0, 10);
  const age =
    days == null
      ? ''
      : days < 60
        ? t('{0} 天', [days])
        : days < 365
          ? t('{0} 个月', [Math.max(1, Math.round(days / 30.44))])
          : t('{0} 年', [Math.round(days / 365.25)]);
  const when = registered ? t('登记 {0}', [registered]) : '';

  return {
    id: 'freshness',
    label: t('网段'),
    value:
      days == null || days < 0 ? t('登记日期未知') : days <= 730 ? t('网段较新') : t('长期登记'),
    hint: [
      days != null && days >= 0 ? t('已登记 {0}', [age]) : '',
      when,
      t('资源登记信息，不参与信誉评分'),
    ]
      .filter(Boolean)
      .join(' · '),
    tone: 'neutral',
  };
}

function runtimeDimension(
  coffeeIp: string,
  terminal: TerminalEgressReading,
  selfLookup: boolean
): QualityDimension {
  if (sameIp(terminal.ip, coffeeIp))
    return {
      id: 'runtime',
      label: t('终端'),
      value: t('同一出口'),
      hint: t('本机 curl 看到的地址与查询地址相同'),
      tone: 'good',
    };
  return {
    id: 'runtime',
    label: t('终端'),
    value: t('不同出口'),
    hint: selfLookup
      ? t('浏览器和终端不是同一条路径，这份结论只描述当前查询地址')
      : t('终端当前出口是 {0}', [terminal.ip]),
    tone: 'warn',
  };
}

/**
 * Cross-check discrete facts from sources we actually read.
 * Outbound cards stay in the table as links; they do not vote.
 * The 0–100 quality score is scoreQuality() in quality-score.ts.
 * Terminal paste is a runtime observation, not a VPN / fraud vote.
 */
export function assessQuality(
  coffee: CoffeeIp,
  intel: CrossIntel | null = null,
  options: {
    pending?: boolean;
    terminal?: TerminalEgressReading | null;
    selfLookup?: boolean;
    now?: number;
  } = {}
): QualityAssessment {
  const pending = options.pending === true && !intel;
  const sources = buildSources(coffee, intel, pending);
  const votes = sources.filter((item) => item.status === 'ready');
  const publicService = identifyPublicService(coffee.ip, options.now);
  const isPublicService =
    coffee.is_public_service === true ||
    publicService != null ||
    votes.some((source) => source.usage === 'public-service');
  const kind = decideKind(votes, coffee, isPublicService);
  const scored = scoreQuality(coffee, sources, {
    prefix: intel ? (intel.prefix ?? null) : undefined,
    places: intel?.places ?? null,
    now: options.now,
    checkedAt: intel?.checkedAt,
    publicService: isPublicService,
  });
  const band = scored.band;
  const terminal = options.terminal ?? null;
  const selfLookup = options.selfLookup === true;

  return {
    kind,
    kindLabel: kindLabel(kind),
    band,
    bandLabel: bandLabel(band),
    summary: buildSummary(kind, votes, coffee, terminal, selfLookup, publicService),
    ...conciseConclusion(kind, votes, scored),
    keyEvidence: keyEvidence(kind, votes, publicService),
    pending,
    sourcesReady: votes.length,
    sourcesTotal: sources.length,
    score: scored.value,
    scoreReference: scored.reference,
    scoreStatus: scored.status,
    scoreMissingSources: scored.missingSources,
    scoreProfile: scored.profile,
    evidence: {
      ...scored.evidence,
      // Reputation evidence = abuse/fraud readings plus Coffee's trust and
      // ASN verdicts, which now live under the network indicator.
      reputation: [
        ...new Set([
          ...scored.evidence.abuse,
          ...scored.evidence.fraud,
          ...(scored.evidence.network.includes('coffee') ? ['coffee'] : []),
        ]),
      ],
    },
    checkedAt:
      intel?.checkedAt && Number.isFinite(Date.parse(intel.checkedAt))
        ? intel.checkedAt
        : undefined,
    scoreBreakdown: {
      reputation: scored.reputation,
      anonymity: scored.anonymity,
      usage: scored.usage,
      indicators: scored.indicators,
      base: scored.base,
      adjusted: scored.adjusted,
      uncapped: scored.uncapped,
      range: scored.range,
      penalties: scored.penalties,
      evidenceCoverage: scored.evidenceCoverage,
      confidence: scored.confidence,
      freshnessDays: scored.freshnessDays,
      prefixRegisteredAt: scored.prefixRegisteredAt,
      cap: scored.cap,
    },
    network: networkDimension(kind, votes, coffee),
    reputation: reputationDimension(votes, scored),
    freshness: intel ? freshnessDimension(scored) : undefined,
    runtime: terminal ? runtimeDimension(coffee.ip, terminal, selfLookup) : undefined,
    terminalIp: terminal?.ip,
    publicService,
    sources,
  };
}
