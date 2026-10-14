/**
 * /api/ip/grade 的返回结构。对应 ip-quality-report.py 的 collect + judge：
 * 五门判定 + T0–T3- 品质分档 + 旁证 + 人工核对清单。
 * 门规原文和 detail 文案由 Worker 直接返回，前端只做呈现。
 */

export type GradeGateStatus = '通过' | '不过' | '无法判断' | '待核对';

export interface GradeGate {
  name: string;
  expected: string;
  status: GradeGateStatus;
  detail: string;
}

export interface GradeSourceError {
  ok: false;
  error?: string;
}

export interface GradeSources {
  ripe?: { ok: boolean; prefix?: string; asns?: string[]; error?: string };
  rdap?: {
    ok: boolean;
    name?: string;
    handle?: string;
    prefix?: string;
    length?: number;
    type?: string;
    registrant?: string;
    start?: string;
    end?: string;
    error?: string;
  };
  ipinfo?: {
    ok: boolean;
    asn?: string;
    asn_name?: string;
    asn_type?: string;
    route?: string;
    company?: string;
    company_type?: string;
    city?: string;
    region?: string;
    country?: string;
    timezone?: string;
    hostname?: string;
    proxy?: boolean;
    vpn?: boolean;
    tor?: boolean;
    hosting?: boolean;
    error?: string;
  };
  ipwho?: {
    ok: boolean;
    asn?: number;
    org?: string;
    isp?: string;
    city?: string;
    region?: string;
    country?: string;
    timezone?: string;
    error?: string;
  };
  ipquery?: {
    ok: boolean;
    asn?: string;
    org?: string;
    isp?: string;
    city?: string;
    region?: string;
    country?: string;
    datacenter?: boolean;
    vpn?: boolean;
    proxy?: boolean;
    tor?: boolean;
    risk_score?: number;
    error?: string;
  };
  proxycheck?: {
    ok: boolean;
    asn?: string;
    provider?: string;
    organisation?: string;
    type?: string;
    proxy?: string;
    risk?: string;
    hostname?: string;
    city?: string;
    region?: string;
    country?: string;
    error?: string;
  };
  scamalytics?: {
    ok: boolean;
    score?: number;
    isp?: string;
    org?: string;
    datacenter?: string;
    vpn?: string;
    server?: string;
    residential_proxy?: string;
    public_proxy?: string;
    error?: string;
  };
}

export interface GradeReport {
  ip: string;
  rdns: string;
  fetched_at: string;
  expect: { state: string | null; tz: string | null };
  stable_confirmed: boolean;
  sources: GradeSources;
  verdict: string;
  gates: GradeGate[];
  tier: string;
  tier_why: string;
  tier_scale: string;
  side: string[];
  checklist: string[];
}

export interface GradeOptions {
  expectState?: string;
  expectTz?: string;
  stableConfirmed?: boolean;
}

/** 五门判定只覆盖 IPv4；IPv6 页面上给提示而不是报错。 */
export function gradeSupports(ip: string) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(ip);
}

/** T 档提取：'T3- 带毒指纹' -> 'T3-'，用于徽章和色调。 */
export function tierCode(tier: string) {
  return tier.split(' ')[0] ?? tier;
}

export function gateTone(status: GradeGateStatus): 'good' | 'bad' | 'warn' | 'neutral' {
  if (status === '通过') return 'good';
  if (status === '不过') return 'bad';
  return 'warn';
}

export function tierTone(tier: string): 'good' | 'warn' | 'bad' | 'neutral' {
  const code = tierCode(tier);
  if (code === 'T0' || code === 'T1+' || code === 'T1') return 'good';
  if (code === 'T1-' || code === 'T2+' || code === 'T2' || code === 'T3+') return 'warn';
  return 'bad';
}
