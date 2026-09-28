import type { UseQueryResult } from '@tanstack/react-query';

import { t } from '@/i18n';

import type { ServiceStatus } from './api';
import { type StatusQuerySnapshot, presentStatus } from './presentation';

export type ServiceRow = {
  id: string;
  name: string;
  group: string;
  url?: string;
  page?: string;
  icon?: string;
  note?: string;
  statusSource?: string;
  officialStatus?: boolean | string;
  probe?: unknown;
  requested: boolean;
  query: UseQueryResult<ServiceStatus, Error>;
};

export function presentedOf(row: ServiceRow) {
  const snapshot: StatusQuerySnapshot = {
    url: row.url,
    requested: row.requested,
    isPending: row.query.isPending,
    isError: row.query.isError,
    isRefetchError: row.query.isRefetchError,
    data: row.query.data,
  };
  return presentStatus(snapshot);
}

export const indicatorOf = (row: ServiceRow): string => presentedOf(row).indicator;

export function statusText(row: ServiceRow): string {
  const presented = presentedOf(row);
  return t(presented.textKey, presented.textValues);
}

export function severityRank(row: ServiceRow): number {
  if (!row.url) return 6;
  const rank: Record<string, number> = {
    critical: 0,
    major: 1,
    minor: 2,
    maintenance: 3,
    none: 4,
  };
  return rank[indicatorOf(row)] ?? 5;
}
