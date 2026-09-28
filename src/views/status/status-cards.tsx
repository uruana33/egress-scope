import { SiteLogo } from '@/components/site-logo';
import { Pending } from '@/components/toolkit';
import { locale, t } from '@/i18n';

import { type ServiceRow, indicatorOf, statusText } from './row-model';

export function SpectrumBar({ row }: { row: ServiceRow }) {
  const loading = row.requested && row.url && !row.query.data;
  return (
    <a
      className={`sw-bar sw-${indicatorOf(row)}${loading ? ' sw-bar-loading' : ''}`}
      title={`${row.name} — ${statusText(row)}`}
      aria-label={t('前往 {0} 官方状态页', [row.name])}
      href={row.page}
      target="_blank"
      rel="noreferrer"
    />
  );
}

export function FlipCard({
  row,
  index,
  focused,
}: {
  row: ServiceRow;
  index: number;
  focused: boolean;
}) {
  const fetching = row.requested && row.query.isFetching;
  const incidents = row.query.data?.incidents?.length ?? 0;
  const fetchedAt = row.query.data?.fetchedAt;
  return (
    <a
      className={`sw-flip sw-${indicatorOf(row)}${focused ? ' sw-flip-focus' : ''}`}
      style={{ animationDelay: `${Math.min(index, 14) * 40}ms` }}
      href={row.page}
      target="_blank"
      rel="noreferrer"
      aria-label={t('前往 {0} 官方状态页', [row.name])}>
      <span className="sw-flip-top">
        <i className={`sw-block${fetching ? ' sw-block-loading' : ''}`} aria-hidden="true" />
        <SiteLogo src={row.icon} website={row.page} className="size-4 shrink-0 rounded-sm" />
        <span className="sw-flip-name" title={row.name}>
          {row.name}
        </span>
        {incidents > 0 && (
          <span className="sw-flip-incidents">
            {incidents}
            {t('个事件')}
          </span>
        )}
      </span>
      <span className="sw-flip-bottom">
        <span className="sw-flip-status">
          {fetching && !row.query.data ? <Pending>{t('查询中…')}</Pending> : statusText(row)}
        </span>
        <span className="sw-flip-time">
          {fetchedAt
            ? t('读取于 {0}', [
                new Date(fetchedAt).toLocaleTimeString(locale, {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              ])
            : '——'}
        </span>
      </span>
    </a>
  );
}
