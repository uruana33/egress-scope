import { t } from '@/i18n';

import { type CoffeeIp, coffeeThreatLabels } from './coffee.ts';

const COMPANY_TYPES: Record<string, string> = {
  isp: t('网络运营商'),
  hosting: t('托管服务商'),
  business: t('商业企业'),
  education: t('教育机构'),
  government: t('政府机构'),
  banking: t('金融机构'),
};

function scoreOf(data: CoffeeIp) {
  const value = data.trust_score;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
    ? value
    : null;
}

function typeOf(data: CoffeeIp, conflict: boolean) {
  if (data.is_public_service) return t('公共服务');
  if (conflict) return t('类型标记冲突');
  if (data.is_mobile) return t('移动网络');
  if (data.isResidential) return t('家庭住宅 IP');
  if (data.is_datacenter) return t('数据中心');
  return t('未知');
}

function flagPairs(data: CoffeeIp): [string, boolean | undefined][] {
  return [
    ['VPN', data.is_vpn],
    [t('代理'), data.is_proxy],
    ['Tor', data.is_tor],
    [t('爬虫标记'), data.is_crawler],
    [t('滥用标记'), data.is_abuser],
    ['Bogon', data.is_bogon],
  ];
}

function riskOf(data: CoffeeIp, score: number | null, detected: string[], threats: string[]) {
  const seriousFlags = [
    ...(data.is_abuser ? [t('滥用标记')] : []),
    ...(data.is_bogon ? ['Bogon'] : []),
    ...threats,
  ];
  if (seriousFlags.length) {
    return {
      severity: 'danger' as const,
      title: t('发现风险信号'),
      flags: [...new Set([...detected, ...threats])],
      description: t(
        '数据源返回滥用、保留地址或威胁记录。建议核实网络来源，必要时更换出口后重新检测。'
      ),
    };
  }
  if (score !== null && score < 45 && !data.is_public_service) {
    return {
      severity: 'danger' as const,
      title: t('信誉分偏低'),
      flags: detected,
      description: t('当前信誉分为 {0}/100，建议结合网络标记核实使用风险。', [score]),
    };
  }
  if (detected.length) {
    return {
      severity: 'notice' as const,
      title: t('检测到网络标记'),
      flags: detected,
      description: t(
        '代理、VPN、Tor 或爬虫标记可能影响部分网站的访问验证；标记本身不等于恶意行为。'
      ),
    };
  }
  return null;
}

const scoreBandOf = (score: number | null) =>
  score === null ? null : score >= 90 ? 3 : score >= 75 ? 2 : score >= 45 ? 1 : 0;

export function ipProfile(data: CoffeeIp) {
  const score = scoreOf(data);
  const companyType = data.company_type?.trim().toLowerCase();
  const company = companyType ? (COMPANY_TYPES[companyType] ?? data.company_type!) : t('未知');
  const conflict = data.isResidential === true && data.is_datacenter === true;
  const type = typeOf(data, conflict);

  const country = data.countryCode?.trim().toUpperCase();
  const registered = data.registered_country_code?.trim().toUpperCase();
  const sameCountry =
    country && registered && !data.is_public_service ? country === registered : null;

  const flags = flagPairs(data);
  const detected = flags.filter(([, value]) => value === true).map(([label]) => label);
  const unknownFlags = flags.filter(([, value]) => typeof value !== 'boolean').length;
  const threats = coffeeThreatLabels(data, true);
  const clear = !detected.length && !unknownFlags && !threats.length;

  const preferred =
    score !== null &&
    score >= 90 &&
    data.isResidential === true &&
    data.is_datacenter === false &&
    !data.is_mobile &&
    !data.is_public_service &&
    companyType === 'isp' &&
    sameCountry === true &&
    clear;

  const risk = riskOf(data, score, detected, threats);

  // Levels describe the available network profile, not hardware or line speed.
  const level: 'S' | 'A' | 'B' | 'C' | null =
    data.is_public_service ||
    conflict ||
    !clear ||
    score === null ||
    type === t('未知') ||
    !companyType
      ? null
      : preferred
        ? 'S'
        : score >= 90
          ? 'A'
          : score >= 75
            ? 'B'
            : 'C';

  let grade = t('信息不足');
  let explanation = t('部分类型或风险数据缺失，暂不判断配置档位。');
  let tone: 'good' | 'warn' | 'bad' | 'neutral' = 'neutral';
  if (data.is_public_service) {
    grade = t('公共服务网络');
    explanation = t('公共 DNS、CDN 等服务可能使用任播，不按个人住宅或机房出口评定档位。');
  } else if (conflict) {
    grade = t('类型待确认');
    explanation = t('数据源同时返回住宅与数据中心标记，不能据此认定为优质住宅。');
    tone = 'warn';
  } else if (detected.length || threats.length) {
    grade = t('存在网络标记');
    explanation = t('已返回 {0}；代理、VPN 等标记本身不等于恶意行为。', [
      [...detected, ...threats].join('、'),
    ]);
    tone = data.is_abuser || data.is_bogon || threats.length ? 'bad' : 'warn';
  } else if (preferred) {
    grade = t('住宅优选');
    explanation = t('住宅 IP、ISP 厂商、注册地一致、信誉分 ≥ 90，且六项网络标记均未检出。');
    tone = 'good';
  } else if (score !== null && type !== t('未知') && clear) {
    grade =
      score >= 90
        ? data.is_mobile
          ? t('高信誉网络')
          : data.is_datacenter
            ? t('高信誉机房')
            : data.isResidential
              ? t('高信誉住宅')
              : t('高信誉网络')
        : score >= 75
          ? t('信誉良好')
          : score >= 45
            ? t('信誉一般')
            : t('信誉偏低');
    explanation = t('按数据源信誉分分档：90–100 高信誉，75–89 良好，45–74 一般，0–44 偏低。');
    tone = score >= 75 ? 'good' : score >= 45 ? 'warn' : 'bad';
  }

  const checks: {
    label: string;
    value: string;
    requirement: string;
    passed: boolean | null;
  }[] = [
    {
      label: t('IP 类型'),
      value: type,
      requirement: t('住宅且非机房、非移动网络'),
      passed:
        data.is_public_service ||
        conflict ||
        data.is_mobile ||
        data.isResidential === false ||
        data.is_datacenter === true
          ? false
          : data.isResidential === true && data.is_datacenter === false
            ? true
            : null,
    },
    {
      label: t('厂商类型'),
      value: company,
      requirement: t('厂商类型为 ISP'),
      passed: companyType ? companyType === 'isp' : null,
    },
    {
      label: t('注册地对照'),
      value: sameCountry === null ? t('待确认') : sameCountry ? t('注册地一致') : t('注册地不同'),
      requirement: t('注册国家与定位国家一致'),
      passed: sameCountry,
    },
    {
      label: t('网络标记'),
      value:
        detected.length || threats.length
          ? t('有标记')
          : unknownFlags
            ? t('缺少 {0} 项数据', [unknownFlags])
            : t('6 项均未检出'),
      requirement: t('六项标记均未检出，且无已知威胁'),
      passed: detected.length || threats.length ? false : unknownFlags ? null : true,
    },
    {
      label: t('IP 信誉分'),
      value: score === null ? t('未知') : `${score} / 100`,
      requirement: t('信誉分 ≥ 90'),
      passed: score === null ? null : score >= 90,
    },
  ];

  return {
    score,
    scoreBand: scoreBandOf(score),
    grade,
    explanation,
    tone,
    checks,
    preferred,
    level,
    risk,
  };
}
