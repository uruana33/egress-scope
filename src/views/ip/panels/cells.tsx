import type { ReactNode } from 'react';

import { NumberTicker } from '@/components/number-ticker';
import { Badge } from '@/components/ui/badge';
import { t } from '@/i18n';
import { companyTypeColors } from '@/lib/ip-badge-colors';

/**
 * The cell renderers shared by the detail panels. They live apart from the
 * panels so that a panel file exports nothing but its component.
 */
export const chip = (label: string, tone = 'neutral', title?: string) => (
  <span className={`ip-chip ip-chip-${tone}`} title={title}>
    {label}
  </span>
);

export const yesNo = (value?: boolean) =>
  chip(typeof value !== 'boolean' ? t('未知') : value ? t('是') : t('否'));

/** Absent data stays "unknown"; it is never reported as a clean result. */
export const riskFlag = (value?: boolean) =>
  typeof value !== 'boolean'
    ? chip(t('未知'))
    : value
      ? chip(t('已检测到'), 'bad')
      : chip(t('未检测到'), 'good');

export const number = (value?: number): ReactNode =>
  typeof value === 'number' && Number.isFinite(value) ? (
    <NumberTicker value={value} formatValue={(v) => Math.round(v).toLocaleString()} />
  ) : (
    '—'
  );

export const companyBadge = (type?: string) =>
  type ? (
    <Badge
      variant="secondary"
      className={companyTypeColors[type.toLowerCase()] ?? 'bg-primary/5 text-primary'}>
      {type}
    </Badge>
  ) : undefined;

/** Upstream timestamps are seconds since the epoch, not milliseconds. */
export const formatSeen = (value?: number) =>
  value ? new Date(value * 1000).toLocaleDateString() : '—';

const rpkiLabels: Record<string, string> = {
  valid: t('有效'),
  invalid: t('无效'),
  notfound: t('未声明 ROA'),
  unknown: t('未知'),
};

export const rpkiLabel = (status?: string) =>
  status ? (rpkiLabels[status.toLowerCase()] ?? status) : t('未知');
