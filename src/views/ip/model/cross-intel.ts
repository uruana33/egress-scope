import { t } from '@/i18n';
import { anonymousNegative, readingAnonymity } from '@/views/ip/model/anonymity';

import type { PrefixAge } from './prefix-age';
import type { ScoreTone } from './scores';

export type CrossSource =
  | 'ip2location'
  | 'ipinfo'
  | 'ipapi'
  | 'scamalytics'
  | 'ipqs'
  | 'abuseipdb'
  | 'ippure'
  | 'proxycheck'
  | 'dnsbl'
  | 'torexit'
  | 'ipregistry';

export interface CrossReading {
  id: string;
  source: CrossSource;
  metric:
    'risk' | 'fraud' | 'purity' | 'usage' | 'native' | 'privacy' | 'proxy' | 'blocklist' | 'abuse';
  value: string;
  hint: string;
  tone: ScoreTone;
  href: string;
  /** Only fields actually read from the provider; absent means unknown. */
  flags?: Partial<
    Record<
      'vpn' | 'proxy' | 'tor' | 'relay' | 'residentialProxy' | 'hosting' | 'anonymous',
      boolean
    >
  >;
}

export interface CrossPlace {
  source: CrossSource;
  href: string;
  city?: string;
  region?: string;
  country?: string;
  country_code?: string;
  latitude?: number;
  longitude?: number;
}

export interface CrossIntel {
  ip: string;
  readings: CrossReading[];
  places?: CrossPlace[];
  unavailable: CrossSource[];
  /** Why an automatic source could not be read (e.g. "quota"). */
  unavailableReasons?: Partial<Record<CrossSource, string>>;
  prefix?: PrefixAge | null;
  /** Fetch time, not the provider database's update time. */
  checkedAt?: string;
}

export interface DisplayScore {
  id: string;
  label: string;
  source: string;
  href?: string;
  value: string;
  hint: string;
  detail: string;
  tone: ScoreTone;
  kind: 'local' | 'cross';
}

const SOURCE_NAME: Record<string, string> = {
  ip2location: 'IP2Location',
  ipinfo: 'IPinfo',
  ipapi: 'IP-API',
  scamalytics: 'Scamalytics',
  ipqs: 'IPQualityScore',
  abuseipdb: 'AbuseIPDB',
  ippure: 'IPPure',
  proxycheck: 'proxycheck.io',
  dnsbl: 'DNSBL 黑名单',
  torexit: 'Tor 出口名单',
  ipregistry: 'IPregistry',
};

function metricLabel(reading: CrossReading) {
  if (reading.metric === 'risk') return reading.source === 'proxycheck' ? t('风险分') : t('风控值');
  if (reading.metric === 'fraud')
    return reading.source === 'abuseipdb' ? t('滥用置信度') : t('欺诈分');
  if (reading.metric === 'purity') return t('纯净度');
  if (reading.metric === 'native') return t('原生 IP');
  if (reading.metric === 'privacy') return t('隐私检测');
  if (reading.metric === 'proxy') return t('代理类型');
  if (reading.metric === 'blocklist') return t('滥用黑名单');
  if (reading.metric === 'abuse') return t('滥用标记');
  return t('用途类型');
}

function displayValue(reading: CrossReading) {
  if (reading.metric === 'abuse') return reading.value === 'Yes' ? t('已标记') : t('未标记');
  if (reading.metric === 'blocklist')
    return Number.parseInt(reading.value, 10) ? t('列入 {0}', [reading.value]) : t('未列入');
  // A single-flag source fully answers its own question; it is not an
  // incomplete anonymity check.
  if (reading.source === 'torexit' && reading.value === 'No') return t('未列入');
  if ((reading.metric === 'privacy' || reading.metric === 'proxy') && reading.value === 'No')
    return anonymousNegative(readingAnonymity(reading))
      ? t('已检测项目未检出')
      : t('匿名检测不完整');
  if (reading.source === 'ipapi' && reading.metric === 'proxy' && reading.value !== 'No')
    return t('匿名出口（未分类型）');
  return reading.value;
}

function displayHint(reading: CrossReading) {
  const polarity =
    reading.metric === 'risk' || reading.metric === 'fraud'
      ? t('越高越危险')
      : reading.metric === 'purity'
        ? t('越高越好')
        : '';
  const extra = reading.hint === 'Hosting' ? t('托管') : reading.hint;
  return [extra, polarity].filter(Boolean).join(' · ');
}

export function coffeeHref(ip: string) {
  return `https://ip.net.coffee/ip/${encodeURIComponent(ip)}`;
}

export function sourceName(source: string) {
  return SOURCE_NAME[source] ?? source;
}

export function displayCrossReadings(readings: CrossReading[]): DisplayScore[] {
  return readings.map((reading) => {
    const source = sourceName(reading.source);
    const label = metricLabel(reading);
    const value = displayValue(reading);
    const hint = displayHint(reading);
    return {
      id: reading.id,
      label,
      source,
      href: reading.href,
      value,
      hint,
      detail: `${source} · ${label}`,
      tone:
        reading.source === 'torexit'
          ? reading.tone
          : (reading.metric === 'privacy' || reading.metric === 'proxy') &&
              reading.value === 'No' &&
              !anonymousNegative(readingAnonymity(reading))
            ? 'neutral'
            : reading.tone,
      kind: 'cross',
    };
  });
}
