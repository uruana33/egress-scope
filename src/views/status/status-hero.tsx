import { NumberTicker } from '@/components/number-ticker';
import { Pending } from '@/components/toolkit';
import { Button } from '@/components/ui/button';
import { t } from '@/i18n';

import { type ServiceRow, statusText } from './row-model';
import { SpectrumBar } from './status-cards';

const LEGEND: [string, string][] = [
  ['sw-none', t('正常运行')],
  ['sw-minor', t('轻微 / 维护')],
  ['sw-major', t('严重故障')],
  ['sw-unknown', t('待确认')],
  ['sw-none-integrated', t('未接入')],
];

export function StatusHero({
  rows,
  issueRows,
  healthyCount,
  unknownCount,
  headlineKey,
  pending,
  onRefresh,
}: {
  rows: ServiceRow[];
  issueRows: ServiceRow[];
  healthyCount: number;
  unknownCount: number;
  headlineKey: string;
  pending: boolean;
  onRefresh: () => void;
}) {
  return (
    <section className="sw-hero">
      <div className="sw-hero-top">
        <h2 className={`sw-hero-state${issueRows.length > 0 ? ' sw-hero-state-alert' : ''}`}>
          {t(headlineKey, [headlineKey === '{0} 个服务需要关注' ? issueRows.length : unknownCount])}
        </h2>
        <div className="sw-hero-counts">
          <span className="sw-count sw-count-ok">
            <NumberTicker value={healthyCount} />
            <em>{t('运行中')}</em>
          </span>
          <span className="sw-count-sep" aria-hidden="true">
            /
          </span>
          <span className="sw-count sw-count-issue">
            <NumberTicker value={issueRows.length} />
            <em>{t('异常')}</em>
          </span>
          <span className="sw-count-sep" aria-hidden="true">
            /
          </span>
          <span className="sw-count sw-count-unknown">
            <NumberTicker value={unknownCount} />
            <em>{t('未知')}</em>
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            aria-busy={pending}
            onClick={onRefresh}>
            {pending ? <Pending>{t('刷新中…')}</Pending> : t('刷新状态')}
          </Button>
        </div>
      </div>
      <div className="sw-strip" role="list" aria-label={t('服务状态总览')}>
        {rows.map((row) => (
          <SpectrumBar key={row.id} row={row} />
        ))}
      </div>
      <div className="sw-legend">
        {LEGEND.map(([swClass, text]) => (
          <span className="sw-legend-item" key={swClass}>
            <i className={`sw-block ${swClass}`} aria-hidden="true" />
            {text}
          </span>
        ))}
      </div>
    </section>
  );
}

export function IssueAlert({ issueRows }: { issueRows: ServiceRow[] }) {
  if (!issueRows.length) return null;
  return (
    <div className="sw-alert" role="alert">
      <span className="sw-alert-tag">{t('告警')}</span>
      <span className="sw-alert-items">
        {issueRows.map((row, index) => (
          <span key={row.id} className="sw-alert-item">
            {index > 0 && (
              <span className="sw-alert-sep" aria-hidden="true">
                ·
              </span>
            )}
            <a href={row.page} target="_blank" rel="noreferrer">
              {row.name}
            </a>
            <em>{statusText(row)}</em>
          </span>
        ))}
      </span>
    </div>
  );
}
