import type { ServiceStatus } from './api';

export const STATUS_FRESHNESS_MS = 5 * 60 * 1000;

const STATUS_LABELS: Record<string, string> = {
  none: '正常运行',
  operational: '正常运行',
  minor: '轻微故障',
  degraded_performance: '轻微故障',
  major: '严重故障',
  major_outage: '严重故障',
  critical: '重大故障',
  partial_outage: '部分故障',
  maintenance: '维护中',
  under_maintenance: '维护中',
};

const INCIDENT_LABELS: Record<string, string> = {
  investigating: '调查中',
  identified: '已识别',
  monitoring: '监控中',
  ongoing: '进行中',
  open: '进行中',
  in_progress: '进行中',
  verifying: '验证中',
  scheduled: '已计划',
  resolved: '已解决',
  completed: '已完成',
  cancelled: '已取消',
};

export function statusLabelKey(value: string | undefined, indicator?: string): string {
  const preferred = indicator && STATUS_LABELS[indicator.toLowerCase()];
  if (preferred) return preferred;
  if (!value) return '待确认';
  const normalized = value.trim().toLowerCase();
  return STATUS_LABELS[normalized] ?? INCIDENT_LABELS[normalized] ?? value;
}

export function isStatusExpired(fetchedAt: string | undefined, now = Date.now()): boolean {
  const timestamp = fetchedAt ? Date.parse(fetchedAt) : Number.NaN;
  return !Number.isFinite(timestamp) || timestamp > now || now - timestamp > STATUS_FRESHNESS_MS;
}

export interface StatusQuerySnapshot {
  url?: string;
  requested?: boolean;
  isPending?: boolean;
  isError?: boolean;
  isRefetchError?: boolean;
  data?: ServiceStatus;
}

export interface PresentedStatus {
  indicator: string;
  current: boolean;
  stale: boolean;
  textKey: string;
  textValues?: string[];
}

export function presentStatus(snapshot: StatusQuerySnapshot, now = Date.now()): PresentedStatus {
  if (!snapshot.url)
    return {
      indicator: 'none-integrated',
      current: false,
      stale: false,
      textKey: '未接入',
    };

  const stale = Boolean(
    snapshot.data &&
    (snapshot.isError || snapshot.isRefetchError || isStatusExpired(snapshot.data.fetchedAt, now))
  );
  if (stale) {
    return {
      indicator: 'unknown',
      current: false,
      stale: true,
      textKey: '上次结果：{0}',
      textValues: [
        statusLabelKey(snapshot.data?.status.description, snapshot.data?.status.indicator),
      ],
    };
  }

  if (!snapshot.data)
    return {
      indicator: 'unknown',
      current: false,
      stale: false,
      textKey: snapshot.isPending ? '查询中…' : '待确认',
    };

  if (snapshot.data.evidence?.kind === 'reachability') {
    const serverErrors = (snapshot.data.evidence.endpoints ?? [])
      .map((endpoint) => endpoint.httpStatus)
      .filter((status): status is number => status != null && status >= 500);
    if (serverErrors.length)
      return {
        indicator: 'unknown',
        current: true,
        stale: false,
        textKey: 'HTTP {0} 异常 · 业务状态未知',
        textValues: [[...new Set(serverErrors)].join(' / ')],
      };
    return {
      indicator: 'unknown',
      current: true,
      stale: false,
      textKey: '仅连通性参考',
    };
  }

  return {
    indicator: snapshot.data.status.indicator,
    current: true,
    stale: false,
    textKey: statusLabelKey(snapshot.data.status.description, snapshot.data.status.indicator),
  };
}

export interface PresentedSummary {
  healthyCount: number;
  issueCount: number;
  unknownCount: number;
  headlineKey: string;
}

export function presentSummary(rows: StatusQuerySnapshot[], now = Date.now()): PresentedSummary {
  const presented = rows.map((row) => presentStatus(row, now));
  const issueCount = presented.filter((row) =>
    ['minor', 'major', 'critical', 'maintenance'].includes(row.indicator)
  ).length;
  const healthyCount = presented.filter((row) => row.current && row.indicator === 'none').length;
  const unknownCount = presented.filter((row) => row.indicator === 'unknown').length;
  return {
    healthyCount,
    issueCount,
    unknownCount,
    headlineKey:
      issueCount > 0
        ? '{0} 个服务需要关注'
        : unknownCount > 0
          ? '{0} 个服务待确认'
          : healthyCount > 0
            ? '全部服务运行正常'
            : '正在检测服务状态…',
  };
}
