import { t } from '@/i18n';
import type { SourceMethod } from '@/lib/diagnostic-source';
import type { DiagnosticResult } from '@/lib/diagnostics';
import type { Geo } from '@/lib/types';

export type EgressSheetTone = 'ok' | 'pending' | 'blocked' | 'idle';

export type EgressSheetSite = {
  id: string;
  name: string;
  icon: string;
  method: SourceMethod;
  domain?: string;
  url?: string;
  sourceUrl: string;
  extra?: readonly string[];
  note?: string;
  responseHeader?: string;
  pending: boolean;
  geoPending: boolean;
  geo?: Geo;
  diagnostic?: DiagnosticResult;
};

export function siteDisplayName(name: string) {
  return name.replace(/^www\./i, '');
}

export function probeParts(probe: string) {
  try {
    const url = new URL(probe);
    const path = `${url.pathname === '/' ? '' : url.pathname}${url.search}`;
    return { host: url.host, path };
  } catch {
    return { host: probe, path: '' };
  }
}

export function probeTarget(site: {
  method: SourceMethod;
  domain?: string;
  url?: string;
  sourceUrl: string;
}) {
  if (site.method === 'cftrace' && site.domain) return `https://${site.domain}/cdn-cgi/trace`;
  return site.url ?? site.sourceUrl;
}

export function methodLabel(site: { method: SourceMethod; responseHeader?: string }) {
  if (site.method === 'cftrace') return t('Cloudflare Trace');
  if (site.method === 'ip-json') return t('JSON 回显');
  if (site.method === 'ip-text') return t('文本回显');
  if (site.method === 'headers')
    return site.responseHeader ? t('响应头 · {0}', [site.responseHeader]) : t('响应头');
  return t('不支持');
}

export function formatProbeMs(ms?: number) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return undefined;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function siteTone(site: EgressSheetSite): EgressSheetTone {
  if (site.pending) return 'pending';
  if (site.geo?.ip && site.diagnostic?.status === 'ok') return 'ok';
  if (!site.diagnostic && !site.pending) return 'idle';
  return 'blocked';
}

export function siteChip(site: EgressSheetSite) {
  const tone = siteTone(site);
  if (tone === 'pending') return t('检测中');
  if (tone === 'ok') return t('已读取');
  if (site.diagnostic?.status === 'timeout') return t('超时');
  if (tone === 'idle') return t('待检测');
  return t('受阻');
}

export function siteSubtitle(site: EgressSheetSite) {
  const tone = siteTone(site);
  if (tone === 'pending') return t('探针还在路上');
  const parts = [
    methodLabel(site),
    formatProbeMs(site.diagnostic?.networkMs ?? site.diagnostic?.totalMs),
  ].filter(Boolean);
  return parts.join(' · ');
}

export function siteReason(site: EgressSheetSite) {
  const tone = siteTone(site);
  if (tone === 'ok' || tone === 'pending' || tone === 'idle') return undefined;
  const result = site.diagnostic;
  if (!result) return t(site.note ?? '出口检测受阻（接口不支持、跨域限制或连接失败）');
  if (result.status === 'timeout' || result.errorCode === 'timeout')
    return t('检测超时，部分浏览器可能限制了检测接口。');
  if (result.status === 'rate_limited' || result.errorCode === 'rate_limit')
    return t('外部数据源限流，请稍后重试');
  if (result.status === 'cancelled' || result.errorCode === 'aborted') return t('检测已取消');
  if (result.errorCode === 'cors') return t('接口不可读或跨域受限');
  if (result.errorCode === 'http' || result.status === 'http_error')
    return t('HTTP {0}', [result.httpStatus ?? '—']);
  if (
    result.errorCode === 'invalid_ip' ||
    result.errorCode === 'invalid_payload' ||
    result.status === 'parse_error' ||
    result.status === 'invalid'
  )
    return t('响应里没有可用的出口 IP');
  return t(site.note ?? '出口检测受阻（接口不支持、跨域限制或连接失败）');
}

export function geoLine(geo?: { country?: string; city?: string; isp?: string }) {
  return [geo?.country, geo?.city, geo?.isp].filter(Boolean).join(' · ');
}
