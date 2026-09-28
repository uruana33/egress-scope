import { t } from '@/i18n';

/**
 * A layout-shaped placeholder rather than a spinner: the first answer lands in
 * the same position the reader is already looking at, instead of the page
 * jumping once the data arrives.
 */
export function LookupSkeleton() {
  return (
    <div className="ip-folio-skeleton" role="status" aria-busy="true">
      <span className="sr-only">{t('查询中…')}</span>
      <div className="ip-folio-mast">
        <span className="ip-skeleton-panel ip-folio-skeleton-quality" />
        <div className="ip-folio-dims">
          <span className="ip-skeleton-bar ip-skeleton-card" />
          <span className="ip-skeleton-bar ip-skeleton-card" />
        </div>
        <div className="ip-folio-evidence-list">
          <span className="ip-skeleton-panel ip-folio-skeleton-evidence" />
          <span className="ip-skeleton-panel ip-folio-skeleton-evidence" />
          <span className="ip-skeleton-panel ip-folio-skeleton-evidence" />
          <span className="ip-skeleton-panel ip-folio-skeleton-evidence" />
          <span className="ip-skeleton-panel ip-folio-skeleton-evidence" />
          <span className="ip-skeleton-panel ip-folio-skeleton-evidence" />
          <span className="ip-skeleton-panel ip-folio-skeleton-evidence" />
          <span className="ip-skeleton-panel ip-folio-skeleton-evidence" />
          <span className="ip-skeleton-panel ip-folio-skeleton-evidence" />
        </div>
      </div>
      <div className="ip-folio-sheet">
        <span className="ip-skeleton-panel ip-folio-skeleton-col" />
        <span className="ip-skeleton-panel ip-folio-skeleton-col" />
      </div>
      <span className="ip-skeleton-tabs ip-folio-skeleton-meter" />
    </div>
  );
}
