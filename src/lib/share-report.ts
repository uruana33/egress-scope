import { t } from '@/i18n';

const DRAFT_KEY = 'egress-scope:share-draft';

export interface ReportFlags {
  residential?: boolean;
  datacenter?: boolean;
  mobile?: boolean;
  vpn?: boolean;
  proxy?: boolean;
  tor?: boolean;
  crawler?: boolean;
  abuser?: boolean;
}

export interface ReportSummary {
  domestic_ip: string | null;
  overseas_ip: string | null;
  egress_consistent: boolean | null;
  webrtc_match_http: boolean | null;
  dns_match_http: boolean | null;
  quality_score: number | null;
  quality_status: 'good' | 'moderate' | 'poor' | 'unknown' | null;
  asn: number | null;
  isp: string | null;
  flags?: ReportFlags;
}

export interface ShareReport {
  id: string;
  url: string;
  created_at: string;
  expires_at: string;
  summary: ReportSummary;
  notes?: string;
}

export function qualityStatus(score: number | null | undefined): ReportSummary['quality_status'] {
  if (score == null || !Number.isFinite(score)) return null;
  if (score >= 75) return 'good';
  if (score >= 45) return 'moderate';
  return 'poor';
}

export function alignmentLabel(value: boolean | null) {
  if (value === true) return t('一致');
  if (value === false) return t('不一致');
  return t('未检测');
}

function observedPhrase(value: boolean | null, yes: string, no: string, unknown: string) {
  if (value === true) return yes;
  if (value === false) return no;
  return unknown;
}

/**
 * A short note for a group chat or forum post. Chinese first, with one
 * English line so the link still reads as an egress check if the thread is
 * mixed-language. This is the snapshot text, not a verdict.
 */
export function reportShareText(report: { url: string; summary: ReportSummary }) {
  const summary = report.summary;
  const egress = observedPhrase(
    summary.egress_consistent,
    t('国内和海外这次是同一个出口'),
    t('国内和海外这次不是同一个出口'),
    t('国内／海外只测到一侧，还没法比')
  );
  const score =
    summary.quality_score == null
      ? t('质量分这次没读到')
      : t('质量分 {0}', [
          summary.quality_status
            ? `${summary.quality_score}（${summary.quality_status}）`
            : String(summary.quality_score),
        ]);
  const webrtc = observedPhrase(
    summary.webrtc_match_http,
    t('WebRTC 和网页出口一致'),
    t('WebRTC 和网页出口不一致'),
    t('WebRTC 这次没测')
  );
  const dns = observedPhrase(
    summary.dns_match_http,
    t('DNS 和网页出口一致'),
    t('DNS 和网页出口不一致'),
    t('DNS 这次没测')
  );
  return [
    t('刚在出口观测台看了眼当前出口：{0}，{1}。{2}，{3}。', [egress, score, webrtc, dns]),
    t('这是出口／IP 质量检测报告链接，方便丢到群里或论坛对一下，不是平台过审证明：'),
    report.url,
    t('Egress / IP quality check, not a platform verdict: {0}', [report.url]),
  ].join('\n');
}

export function reportMarkdown(report: { url: string; summary: ReportSummary }) {
  const score =
    report.summary.quality_score == null
      ? t('未知')
      : report.summary.quality_status
        ? `${report.summary.quality_score}（${report.summary.quality_status}）`
        : String(report.summary.quality_score);
  return [
    `## ${t('出口观测台报告')}`,
    `- ${t('国内／海外出口')}：${alignmentLabel(report.summary.egress_consistent)}`,
    `- WebRTC vs HTTP：${alignmentLabel(report.summary.webrtc_match_http)}`,
    `- DNS vs HTTP：${alignmentLabel(report.summary.dns_match_http)}`,
    `- ${t('质量分')}：${score}`,
    `- ${t('链接')}：${report.url}`,
  ].join('\n');
}

export function reportDocumentTitle(summary: ReportSummary) {
  const mark =
    summary.egress_consistent === true
      ? t('是')
      : summary.egress_consistent === false
        ? t('否')
        : t('未测');
  const score = summary.quality_score == null ? t('未知') : String(summary.quality_score);
  return t('出口一致性报告 · 一致={0} · 分{1} · 出口观测台', [mark, score]);
}

function integerAsn(value: number | string | null | undefined) {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value);
    if (parsed <= 4294967295) return parsed;
  }
  return null;
}

export function flagsFromCoffee(
  coffee?: {
    isResidential?: boolean;
    is_datacenter?: boolean;
    is_mobile?: boolean;
    is_vpn?: boolean;
    is_proxy?: boolean;
    is_tor?: boolean;
    is_crawler?: boolean;
    is_abuser?: boolean;
  } | null
): ReportFlags | undefined {
  if (!coffee) return undefined;
  const flags: ReportFlags = {};
  const set = (key: keyof ReportFlags, value: boolean | undefined) => {
    if (typeof value === 'boolean') flags[key] = value;
  };
  set('residential', coffee.isResidential);
  set('datacenter', coffee.is_datacenter);
  set('mobile', coffee.is_mobile);
  set('vpn', coffee.is_vpn);
  set('proxy', coffee.is_proxy);
  set('tor', coffee.is_tor);
  set('crawler', coffee.is_crawler);
  set('abuser', coffee.is_abuser);
  return Object.keys(flags).length ? flags : undefined;
}

export function buildHomeShareSummary(input: {
  verdict: 'pending' | 'different' | 'same' | 'partial' | 'empty';
  domesticIp?: string | null;
  overseasIp?: string | null;
  qualityScore?: number | null;
  asn?: number | string | null;
  isp?: string | null;
  flags?: ReportFlags;
}): ReportSummary | null {
  if (input.verdict === 'pending' || input.verdict === 'empty') return null;
  const score =
    typeof input.qualityScore === 'number' && Number.isFinite(input.qualityScore)
      ? Math.max(0, Math.min(100, Math.round(input.qualityScore)))
      : null;
  const summary: ReportSummary = {
    domestic_ip: input.domesticIp || null,
    overseas_ip: input.overseasIp || null,
    egress_consistent:
      input.verdict === 'same' ? true : input.verdict === 'different' ? false : null,
    webrtc_match_http: null,
    dns_match_http: null,
    quality_score: score,
    quality_status: qualityStatus(score),
    asn: integerAsn(input.asn),
    isp: input.isp?.trim() || null,
  };
  if (input.flags) summary.flags = input.flags;
  return summary;
}

export function saveShareDraft(summary: ReportSummary) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(summary));
  } catch {
    /* Storage may be blocked. */
  }
}

export function loadShareDraft(): ReportSummary | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as ReportSummary;
    if (!value || typeof value !== 'object') return null;
    if (!('domestic_ip' in value) && !('overseas_ip' in value)) return null;
    return value;
  } catch {
    return null;
  }
}
