import { IpText } from '@/components/toolkit';
import { t } from '@/i18n';
import { FolioCards, FolioPack } from '@/views/lookup/folio-cards';

export interface Neighbor {
  ip: string;
  city?: string;
  company?: string;
  seen_at?: number;
}

/** Nearby addresses as a card spread — same facts as the old table. */
export function NeighborList({
  rows,
  formatDate,
}: {
  rows: Neighbor[];
  formatDate: (value?: number) => string;
}) {
  if (!rows.length) return null;
  return (
    <FolioPack title={t('关联网络地址')}>
      <FolioCards
        items={rows.map((row, index) => ({
          key: `${row.ip}-${index}`,
          label: formatDate(row.seen_at),
          value: <IpText ip={row.ip} />,
          hint: [row.city, row.company].filter(Boolean).join(' · ') || undefined,
        }))}
      />
    </FolioPack>
  );
}
