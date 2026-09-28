import { t } from '@/i18n';
import type { CrossIntel } from '@/views/ip/model/cross-intel';
import { consensusPlace } from '@/views/ip/model/place';
import { assessQuality, factLine, qualityScoreNotice } from '@/views/ip/model/quality';

import type { CoffeeLookup } from '../coffee';

/**
 * A plain-text digest of the page, for pasting into a ticket or a chat.
 * Labels come from the same i18n table as the UI, so the report reads exactly
 * like the screen the reader was looking at.
 */
export interface BuildReportOptions {
  pending?: boolean;
}

export function buildReport(
  data: CoffeeLookup,
  intel?: CrossIntel | null,
  options: BuildReportOptions = {}
): string {
  const d = data.coffee;
  const quality = assessQuality(d, intel ?? null, {
    pending: options.pending,
  });
  const coverageLevel =
    quality.scoreBreakdown.confidence === 'high'
      ? t('高')
      : quality.scoreBreakdown.confidence === 'medium'
        ? t('中')
        : t('低');
  const saturation = Math.min(1, quality.scoreBreakdown.evidenceCoverage / 0.75);
  const range = quality.scoreBreakdown.range;
  const rangeText =
    range == null
      ? t('未返回')
      : range.lo === range.hi
        ? String(range.lo)
        : `${range.lo}–${range.hi}`;
  const place = consensusPlace(d, intel ?? null);
  const lines = [
    `IP: ${d.ip}`,
    [place.country, place.region, place.city, d.isp].filter(Boolean).join(' · '),
    d.asn ? `AS${d.asn} ${d.asOrganization ?? d.asname ?? ''}`.trim() : '',
    `${t('质量结论')}: ${quality.headline}${
      quality.score != null
        ? ` · ${t('中心分')} ${quality.score} · ${t('质量分')} ${quality.score} · ${t('质量区间')} ${rangeText}${
            quality.scoreStatus === 'provisional' ? ` (${t('估算')})` : ''
          }`
        : ''
    }`,
    quality.pending ? t('读取状态：更新中') : '',
    quality.shortSummary,
    quality.publicService
      ? `${t('官方用途记录：{0}', [quality.publicService.label])} · ${quality.publicService.href} · ${t('核对日期 {0}；仅证明服务用途，不代表信誉或匿名检测结果。', [quality.publicService.verifiedAt.slice(0, 10)])}`
      : '',
    t('有效来源：{0}', [
      quality.scoreBreakdown.indicators
        .map((item) => `${item.label} ${item.sources.length}`)
        .join(' · '),
    ]),
    t('证据覆盖 {0}% · 覆盖饱和度 {1}% · 覆盖等级：{2}', [
      Math.round(quality.scoreBreakdown.evidenceCoverage * 100),
      Math.round(saturation * 100),
      coverageLevel,
    ]),
    t('指标权重：{0}', [
      quality.scoreBreakdown.indicators
        .map(
          (item) =>
            `${item.label} ${t('原始权重')} ${Math.round(item.weight * 100)}% · ${t('有效权重')} ${Math.round(item.effective * 100)}%`
        )
        .join('；'),
    ]),
    t('质量区间是证据边界，不是统计置信区间。'),
    t('覆盖等级是证据覆盖等级，不是统计置信度。'),
    qualityScoreNotice(quality),
    quality.scoreProfile === 'ipv6-four-source'
      ? t('IPv6 配置：IPPure / DNSBL / Tor 名单不适用')
      : '',
    t('本站规则参考，不代表平台通过率或账号安全。'),
    `${quality.network.label}: ${quality.network.value}`,
    `${quality.reputation.label}: ${quality.reputation.value}`,
    quality.freshness ? `${quality.freshness.label}: ${quality.freshness.value}` : '',
    ...quality.sources
      .filter((item) => item.status === 'ready' || item.status === 'outbound')
      .map((item) => `${item.name} (${item.metric}): ${factLine(item.facts)}`),
  ];
  return lines.filter(Boolean).join('\n');
}
