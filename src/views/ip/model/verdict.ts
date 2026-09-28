import { t } from '@/i18n';

import type { CoffeeIp } from '../coffee';

export type VerdictTone = 'good' | 'warn' | 'bad' | 'neutral';

export interface Verdict {
  /** Stable identifier, used as a React key and in tests. */
  id: 'usage' | 'risk' | 'origin';
  label: string;
  value: string;
  tone: VerdictTone;
  /** Why the verdict says what it says, in the reader's terms. */
  hint: string;
}

/** The flags that make an address look like something other than a home line. */
const RISK_FLAGS = [
  ['is_vpn', 'VPN'],
  ['is_proxy', t('代理')],
  ['is_tor', 'Tor'],
  ['is_crawler', t('爬虫')],
  ['is_abuser', t('滥用')],
] as const;

export function usageConflict(d: CoffeeIp): string[] {
  const labels: string[] = [];
  if (d.isResidential === true) labels.push(t('家庭宽带'));
  if (d.is_mobile === true) labels.push(t('移动网络'));
  if (d.is_datacenter === true) labels.push(t('数据中心'));
  if (d.asn_kind?.trim().toLowerCase() === 'residential' && d.isResidential !== true)
    labels.push(t('住宅 ASN'));
  return labels;
}

function usage(d: CoffeeIp): Verdict {
  const base = { id: 'usage', label: t('用途') } as const;
  if (d.is_public_service)
    return {
      ...base,
      value: t('公共服务'),
      tone: 'neutral',
      hint: t('由公共服务商运营的地址，例如公共 DNS。'),
    };
  const conflict = usageConflict(d);
  if (conflict.length > 1)
    return {
      ...base,
      value: t('存在分歧'),
      tone: 'warn',
      hint: t('Net.Coffee 同时标出 {0}，没有合成结论。', [conflict.join(' · ')]),
    };
  if (d.isResidential === true)
    return {
      ...base,
      value: t('家庭宽带'),
      tone: 'good',
      hint: t('数据源将该地址归类为住宅网络。'),
    };
  if (d.is_mobile === true)
    return {
      ...base,
      value: t('移动网络'),
      tone: 'good',
      hint: t('数据源将该地址归类为移动运营商网络。'),
    };
  if (d.is_datacenter === true)
    return {
      ...base,
      value: t('数据中心'),
      tone: 'warn',
      hint: t('机房地址常被风控系统视为非自然用户来源。'),
    };
  return {
    ...base,
    value: t('未知'),
    tone: 'neutral',
    hint: t('数据源没有给出该地址的用途分类。'),
  };
}

function risk(d: CoffeeIp): Verdict {
  const base = { id: 'risk', label: t('代理特征') } as const;
  const hit = RISK_FLAGS.filter(([key]) => d[key] === true).map(([, name]) => name);
  const known = RISK_FLAGS.some(([key]) => typeof d[key] === 'boolean');
  if (!known)
    return {
      ...base,
      value: t('未知'),
      tone: 'neutral',
      hint: t('数据源没有返回代理相关的检测结果。'),
    };
  if (!hit.length)
    return {
      ...base,
      value: t('未检测到'),
      tone: 'good',
      hint: t('未命中 VPN、代理、Tor、爬虫或滥用记录。'),
    };
  return {
    ...base,
    value: t('{0} 项命中', [hit.length]),
    tone: hit.includes(t('滥用')) ? 'bad' : 'warn',
    hint: t('命中：{0}。命中不等于恶意，但可能触发风控。', [hit.join(' · ')]),
  };
}

function origin(d: CoffeeIp): Verdict {
  const base = { id: 'origin', label: t('IP 原生性') } as const;
  if (d.is_public_service || !d.countryCode || !d.registered_country_code)
    return {
      ...base,
      value: t('未知'),
      tone: 'neutral',
      hint: t('缺少注册国家或定位国家，无法比较。'),
    };
  const same = d.countryCode.toLowerCase() === d.registered_country_code.toLowerCase();
  return {
    ...base,
    value: same ? t('注册国与定位国一致') : t('注册地不同'),
    tone: same ? 'good' : 'warn',
    hint: same
      ? t('注册国家与定位国家一致。')
      : t('注册于 {0}，定位在 {1}；跨境运营或数据库差异都可能造成这种情况。', [
          d.registered_country ?? d.registered_country_code.toUpperCase(),
          d.country ?? d.countryCode.toUpperCase(),
        ]),
  };
}

/**
 * The three questions a reader actually opens this page with: what is this
 * address used for, does it look like a proxy, and is it native to where it
 * claims to be. They were previously spread across four cards of raw fields.
 */
export function summarize(d: CoffeeIp): Verdict[] {
  return [usage(d), risk(d), origin(d)];
}

/** A score outside 0–100 cannot be drawn, so it is reported as unknown. */
export function usableScore(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
    ? value
    : null;
}
