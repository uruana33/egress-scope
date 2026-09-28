import { DataTable } from '@/components/data-table';
import { ToolCard } from '@/components/toolkit';
import { t } from '@/i18n';
import type { Geo } from '@/lib/types';

import type { CoffeeLookup } from '../coffee';

/** Where the sources think this address is, and how much they disagree. */
export function LocationPanel({ data }: { data: CoffeeLookup }) {
  return (
    <ToolCard title={t('地理位置 · 多源对比')}>
      <DataTable<Geo>
        className="ip-geo-table"
        columns={[
          { accessorKey: 'source', header: t('数据来源') },
          { accessorKey: 'country', header: t('国家 / 地区') },
          { accessorKey: 'region', header: t('地区') },
          {
            accessorKey: 'city',
            header: t('城市'),
            cell: ({ row }) => (
              <span className="ip-geo-city" title={row.original.city}>
                {row.original.city ?? '—'}
              </span>
            ),
          },
          { accessorKey: 'latitude', header: t('纬度') },
          { accessorKey: 'longitude', header: t('经度') },
        ]}
        data={data.sources}
        empty={t('未获取到归属地数据')}
      />
    </ToolCard>
  );
}
