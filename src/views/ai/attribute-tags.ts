import { t } from '@/i18n';
import type { Risk } from '@/lib/types';
import type { CoffeeIp } from '@/views/ip/coffee';
import { type CrossIntel, sourceName } from '@/views/ip/model/cross-intel';
import { usageConflict } from '@/views/ip/model/verdict';

import type { AiCamp } from './platforms';

type Tag = { label: string; tone: 'good' | 'warn' | 'bad' | 'muted' };

type AttributeFlag = 'vpn' | 'proxy' | 'tor';

function usageKind(value: string | undefined) {
  if (!value) return undefined;
  if (/residential|home|住宅|家宽/i.test(value)) return 'residential' as const;
  if (/datacenter|data center|hosting|server|机房/i.test(value)) return 'datacenter' as const;
  if (/mobile|移动/i.test(value)) return 'mobile' as const;
  return undefined;
}

function crossUsageKinds(cross: CrossIntel | undefined) {
  const kinds = new Set<'residential' | 'datacenter' | 'mobile'>();
  for (const reading of cross?.readings ?? []) {
    const kind = usageKind(reading.value);
    if (kind) kinds.add(kind);
    if (reading.flags?.hosting === true) kinds.add('datacenter');
  }
  return kinds;
}

function mergedFlagValues(
  risk: Risk | undefined,
  cross: CrossIntel | undefined,
  flag: AttributeFlag
) {
  const values: boolean[] = [];
  const coffeeValue = risk?.[flag];
  if (typeof coffeeValue === 'boolean') values.push(coffeeValue);
  for (const reading of cross?.readings ?? []) {
    const crossFlag =
      flag === 'proxy' ? (reading.flags?.proxy ?? reading.flags?.anonymous) : reading.flags?.[flag];
    if (typeof crossFlag === 'boolean') values.push(crossFlag);
  }
  return values;
}

function sourceLabel(coffee: CoffeeIp | undefined, cross: CrossIntel | undefined) {
  const names = new Set<string>();
  if (coffee) names.add('Net.Coffee');
  for (const reading of cross?.readings ?? []) names.add(sourceName(reading.source));
  return [...names].join(' · ');
}

function trustScore(coffee: CoffeeIp | undefined): number | null {
  const score = coffee?.trust_score;
  return typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 100
    ? Math.round(score)
    : null;
}

export function attributeTags(
  coffee: CoffeeIp | undefined,
  risk: Risk | undefined,
  cross?: CrossIntel,
  options: { crossPending?: boolean; crossError?: boolean } = {}
): Tag[] {
  const tags: Tag[] = [];
  const kinds = crossUsageKinds(cross);
  if (coffee?.isResidential === true) kinds.add('residential');
  if (coffee?.is_mobile === true) kinds.add('mobile');
  if (coffee?.is_datacenter === true) kinds.add('datacenter');
  const usageConflictDetected =
    (coffee ? usageConflict(coffee).length > 1 : false) ||
    (kinds.has('residential') && kinds.has('datacenter'));
  const mergedRisk = (flag: AttributeFlag) => {
    const values = mergedFlagValues(risk, cross, flag);
    return {
      positive: values.some(Boolean),
      completeNegative: values.length > 0 && values.every((value) => !value),
      conflict: values.includes(true) && values.includes(false),
    };
  };
  const vpn = mergedRisk('vpn');
  const proxy = mergedRisk('proxy');
  const tor = mergedRisk('tor');
  if (usageConflictDetected || vpn.conflict || proxy.conflict || tor.conflict)
    tags.push({ label: t('属性字段存在分歧'), tone: 'warn' });
  if (coffee?.is_public_service === true) tags.push({ label: t('公共服务'), tone: 'muted' });
  else if (!usageConflictDetected && coffee?.isResidential === true)
    tags.push({ label: t('住宅网络标记'), tone: 'muted' });
  else if (!usageConflictDetected && coffee?.is_datacenter === true)
    tags.push({ label: t('机房 IP'), tone: 'warn' });
  else if (!usageConflictDetected && coffee?.isResidential === false)
    tags.push({ label: t('非住宅 IP'), tone: 'warn' });
  else if (!usageConflictDetected && kinds.has('residential'))
    tags.push({ label: t('住宅网络标记'), tone: 'muted' });
  else if (!usageConflictDetected && kinds.has('datacenter'))
    tags.push({ label: t('机房 IP'), tone: 'warn' });
  if (vpn.positive) tags.push({ label: 'VPN', tone: 'warn' });
  if (proxy.positive) tags.push({ label: t('代理'), tone: 'warn' });
  if (tor.positive) tags.push({ label: 'Tor', tone: 'bad' });
  const flagged =
    vpn.positive || proxy.positive || tor.positive || risk?.recent_abuse || risk?.bot_status;
  if (risk?.recent_abuse) tags.push({ label: t('滥用记录'), tone: 'bad' });
  if (risk?.bot_status) tags.push({ label: t('爬虫标记'), tone: 'warn' });
  if (!flagged && vpn.completeNegative && proxy.completeNegative && tor.completeNegative)
    tags.push({ label: t('无代理标记'), tone: 'good' });
  const score = trustScore(coffee);
  if (score != null)
    tags.push({
      label: t('Net.Coffee 信任 {0}', [score]),
      tone: score >= 70 ? 'good' : score >= 40 ? 'warn' : 'bad',
    });
  const sources = sourceLabel(coffee, cross);
  if (sources) tags.push({ label: t('属性来源 · {0}', [sources]), tone: 'muted' });
  if (options.crossError) tags.push({ label: t('交叉来源暂不可用'), tone: 'muted' });
  else if (options.crossPending) tags.push({ label: t('交叉来源读取中…'), tone: 'muted' });
  else if (cross && !cross.readings.length && cross.unavailable.length)
    tags.push({ label: t('多源属性证据不足'), tone: 'muted' });
  return tags;
}

export function regionTag(camp: AiCamp, countryCode: string | undefined): Tag | null {
  if (!countryCode) return null;
  const cc = countryCode.toLowerCase();
  return {
    label: t('出口位置 · {0}', [cc.toUpperCase()]),
    tone: camp === 'us' && cc === 'cn' ? 'warn' : 'muted',
  };
}
