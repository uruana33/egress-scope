import type { ColumnDef } from '@tanstack/react-table';

import { CountryFlag } from '@/components/country-flag';
import { IpText } from '@/components/toolkit';
import { t } from '@/i18n';
import type { RtcResult } from '@/lib/types';

const geoCell = ({ row }: { row: { original: RtcResult } }) => {
  const geo = row.original.geo;
  if (!geo) return t('未知');
  return (
    <>
      <CountryFlag code={geo.country_code} /> {geo.country ?? ''} {geo.city ?? ''}
    </>
  );
};

const exposesEgress = (row: RtcResult) =>
  row.public && (row.candidateType === 'srflx' || row.candidateType === 'prflx');

export const rtcColumns: ColumnDef<RtcResult>[] = [
  { id: 'number', header: '#', cell: ({ row }) => row.index + 1 },
  {
    accessorKey: 'ip',
    header: t('IP 地址'),
    cell: ({ row }) => <IpText ip={row.original.ip} />,
  },
  {
    accessorKey: 'endpoint',
    header: t('STUN 端点'),
    cell: ({ row }) => row.original.endpoint ?? t('本地'),
  },
  { accessorKey: 'type', header: t('类型') },
  { id: 'geo', header: t('归属地'), cell: geoCell },
  {
    id: 'state',
    header: t('状态'),
    cell: ({ row }) => (exposesEgress(row.original) ? t('请核对出口') : t('本地地址')),
  },
];

export const rtcRowId = (row: RtcResult) =>
  [row.endpoint ?? 'local', row.ip, row.port ?? '', row.protocol ?? ''].join(':');
