import { t } from '@/i18n';
import { type FolioCardItem, FolioCards } from '@/views/lookup/folio-cards';

import type { CoffeeIp } from '../coffee';
import { NeighborList } from '../components/neighbor-list';
import { formatSeen } from './cells';

/** What the sources recorded about this address before today. */
export function HistoryPanel({ d }: { d: CoffeeIp }) {
  const items: FolioCardItem[] = [
    ...(d.location_history ?? []).map((row, index) => ({
      key: `loc-${row.seen_at ?? index}`,
      label: t('位置历史'),
      value: [row.country, row.region, row.city].filter(Boolean).join(' · ') || '—',
      hint: formatSeen(row.seen_at),
    })),
    ...(d.asn_history ?? []).map((row, index) => ({
      key: `asn-${row.seen_at ?? index}`,
      label: t('ASN 历史'),
      value: `AS${row.asn ?? '—'} · ${row.asn_org ?? '—'}`,
      hint: formatSeen(row.seen_at),
    })),
    ...(d.company_history ?? []).map((row, index) => ({
      key: `co-${row.seen_at ?? index}`,
      label: t('企业历史'),
      value: [row.company_name, row.company_type].filter(Boolean).join(' · ') || '—',
      hint: formatSeen(row.seen_at),
    })),
  ];
  const neighbors = d.dc_neighbors ?? [];
  if (!items.length && !neighbors.length) {
    return <p className="ip-folio-note">{t('数据源没有该地址的历史记录。')}</p>;
  }
  return (
    <>
      {items.length ? <FolioCards items={items} /> : null}
      <NeighborList rows={neighbors} formatDate={formatSeen} />
    </>
  );
}
