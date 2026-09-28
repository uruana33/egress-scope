import { t } from '@/i18n';
import {
  type Verdict,
  type VerdictTone,
  summarize,
  usableScore,
  usageConflict,
} from '@/views/ip/model/verdict';

import type { CoffeeIp } from '../coffee';

export type ScoreTone = VerdictTone;

export interface LocalScore {
  id: 'trust' | 'abuse' | 'usage' | 'origin' | 'privacy' | 'kind';
  label: string;
  source: string;
  value: string;
  hint: string;
  detail: string;
  tone: ScoreTone;
}

export function parseAbuseRaw(raw?: string) {
  const text = raw?.trim();
  if (!text)
    return {
      score: null as number | null,
      band: undefined as string | undefined,
    };
  const match = text.match(/^(\d+(?:\.\d+)?)(?:\s*\((.+)\))?/);
  if (!match) return { score: null, band: text };
  const score = Number(match[1]);
  if (!Number.isFinite(score) || score < 0) return { score: null, band: text };
  return { score, band: match[2]?.trim() || undefined };
}

function abuseLevelLabel(level?: string) {
  const key = level?.trim().toLowerCase();
  if (key === 'safe') return t('安全');
  if (key === 'low') return t('低');
  if (key === 'medium') return t('中');
  if (key === 'high') return t('高');
  return level?.trim() || undefined;
}

function abuseTone(score: number | null, level?: string, flagged?: boolean): ScoreTone {
  if (flagged) return 'bad';
  if (score != null) {
    if (score >= 70) return 'bad';
    if (score >= 40) return 'warn';
    return 'good';
  }
  const key = level?.trim().toLowerCase();
  if (key === 'high') return 'bad';
  if (key === 'medium') return 'warn';
  if (key === 'safe' || key === 'low') return 'good';
  return 'neutral';
}

function trustTone(score: number | null): ScoreTone {
  if (score == null) return 'neutral';
  if (score >= 75) return 'good';
  if (score >= 45) return 'warn';
  return 'bad';
}

function fromVerdict(
  id: 'usage' | 'origin' | 'privacy',
  verdict: Verdict,
  hint: string
): LocalScore {
  return {
    id,
    label: verdict.label,
    source: 'Net.Coffee',
    value: verdict.value,
    hint,
    detail: verdict.hint,
    tone: verdict.tone,
  };
}

function usageHint(d: CoffeeIp, verdict: Verdict) {
  if (verdict.value === t('存在分歧')) return usageConflict(d).join(' · ');
  if (verdict.value === t('公共服务')) return t('例如公共 DNS');
  if (verdict.value === t('家庭宽带')) return t('住宅网络');
  if (verdict.value === t('移动网络')) return t('移动运营商网络');
  if (verdict.value === t('数据中心')) return t('常被风控视为非自然来源');
  return t('没有用途分类');
}

function originHint(d: CoffeeIp, verdict: Verdict) {
  if (verdict.value === t('注册国与定位国一致')) return t('注册国与定位国一致');
  if (verdict.value === t('注册地不同'))
    return t('注册于 {0}，定位在 {1}', [
      d.registered_country ?? d.registered_country_code?.toUpperCase(),
      d.country ?? d.countryCode?.toUpperCase(),
    ]);
  return t('缺少注册国家或定位国家');
}

function privacyHint(verdict: Verdict) {
  if (verdict.value === t('未检测到')) return t('未命中 VPN / 代理 / Tor');
  if (verdict.value === t('未知')) return t('数据源没有返回代理检测');
  return verdict.hint;
}

function kindTone(value: string): ScoreTone {
  const key = value.toLowerCase();
  if (key.includes('host') || key.includes('data') || key === 'dch') return 'warn';
  if (key.includes('residential') || key === 'isp') return 'good';
  return 'neutral';
}

function kindReading(d: CoffeeIp): LocalScore {
  const company = d.company_type?.trim();
  const asn = d.asn_kind?.trim();
  if (company && asn && company.toLowerCase() !== asn.toLowerCase()) {
    return {
      id: 'kind',
      label: t('网络类型'),
      source: 'Net.Coffee',
      value: `${company} / ${asn}`,
      hint: t('企业类型与 ASN 类型不一致'),
      detail: t('企业 {0} · ASN {1}', [company, asn]),
      tone: 'warn',
    };
  }
  const value = company || asn || '—';
  return {
    id: 'kind',
    label: t('网络类型'),
    source: 'Net.Coffee',
    value,
    hint: company
      ? t('企业登记用途，不是按网段人工标注')
      : asn
        ? t('ASN 自报类型')
        : t('没有用途分类'),
    detail: t('企业登记用途，不是按网段人工标注'),
    tone: value === '—' ? 'neutral' : kindTone(value),
  };
}

/** Coffee readings we can print. Other sites' scores stay as outbound links. */
export function localScores(d: CoffeeIp): LocalScore[] {
  const trust = usableScore(d.trust_score);
  const parsed = parseAbuseRaw(d.intelligence?.abuser_score_raw ?? d.abuser_score);
  const level = d.intelligence?.abuser_level;
  const levelLabel = abuseLevelLabel(level);
  const abuseValue =
    parsed.score != null
      ? String(parsed.score)
      : (levelLabel ?? (d.is_abuser === true ? t('已检测到') : '—'));
  const abuseHint =
    parsed.score != null || levelLabel
      ? [parsed.band, t('越高越危险')].filter(Boolean).join(' · ')
      : t('数据源没有给出滥用分');
  const [usage, privacy, origin] = summarize(d);

  return [
    {
      id: 'trust',
      label: t('信誉'),
      source: 'Net.Coffee',
      value: trust == null ? '—' : String(trust),
      hint: t('越高越好'),
      detail: t('越高越好。只代表 Net.Coffee 这一家，不是全网纯净度。'),
      tone: trustTone(trust),
    },
    {
      id: 'abuse',
      label: t('滥用'),
      source: 'Net.Coffee',
      value: abuseValue,
      hint: abuseHint,
      detail: abuseHint,
      tone: abuseTone(parsed.score, level, d.is_abuser === true),
    },
    fromVerdict('usage', usage, usageHint(d, usage)),
    fromVerdict('origin', origin, originHint(d, origin)),
    fromVerdict('privacy', privacy, privacyHint(privacy)),
    kindReading(d),
  ];
}
