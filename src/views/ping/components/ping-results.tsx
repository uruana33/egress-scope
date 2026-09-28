import type { ColumnDef } from '@tanstack/react-table';

import { CompactText } from '@/components/compact-text';
import { CountryFlag } from '@/components/country-flag';
import { DataTable } from '@/components/data-table';
import { NumberTicker } from '@/components/number-ticker';
import { Pending } from '@/components/toolkit';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { t } from '@/i18n';

import type { PingResponse } from '../api';

const formatLatency = (value: number) => value.toFixed(1);

interface Row {
  id: string;
  status: string;
  name: string;
  country: string;
  min?: number;
  avg?: number;
  max?: number;
  loss?: number;
}
const columns: ColumnDef<Row>[] = [
  {
    accessorKey: 'name',
    header: t('节点'),
    cell: ({ row }) => (
      <span className="site-cell">
        <CountryFlag code={row.original.country} />
        <CompactText text={row.original.name} />
      </span>
    ),
  },
  {
    accessorKey: 'status',
    header: t('状态'),
    cell: ({ row }) =>
      row.original.status === t('测试中...') ? (
        <Pending>{t('测试中...')}</Pending>
      ) : (
        <Badge
          variant={
            row.original.status === t('失败') || row.original.avg == null || row.original.avg < 0
              ? 'destructive'
              : 'secondary'
          }>
          {row.original.status}
        </Badge>
      ),
  },
  ...(['min', 'avg', 'max'] as const).map((key, i) => ({
    accessorKey: key,
    header: [t('最小'), t('平均'), t('最大')][i],
    cell: ({ row }: { row: { original: Row } }) =>
      row.original[key] == null ? (
        '—'
      ) : (
        <>
          <NumberTicker value={row.original[key]!} formatValue={formatLatency} /> ms
        </>
      ),
  })),
  {
    accessorKey: 'loss',
    header: t('丢包'),
    cell: ({ row }) =>
      row.original.loss == null ? (
        '—'
      ) : (
        <>
          <NumberTicker value={row.original.loss} />%
        </>
      ),
  },
];

export function PingResults({ data, pending }: { data?: PingResponse; pending: boolean }) {
  const rows: Row[] = (data?.results ?? []).map((item, index) => ({
    id: String(index),
    name: `${item.probe.city} · ${item.probe.network}`,
    country: item.probe.country,
    status:
      item.result.status === 'finished'
        ? item.result.stats?.avg == null || item.result.stats.avg < 0
          ? t('无响应')
          : t('完成')
        : item.result.status === 'failed'
          ? t('失败')
          : pending
            ? t('测试中...')
            : t('未完成'),
    ...item.result.stats,
  }));
  rows.sort((a, b) => {
    const left = a.avg != null && Number.isFinite(a.avg) && a.avg >= 0 ? a.avg : -1;
    const right = b.avg != null && Number.isFinite(b.avg) && b.avg >= 0 ? b.avg : -1;
    return right - left;
  });
  const validRows = rows.filter((r) => r.avg != null && Number.isFinite(r.avg) && r.avg > 0);
  const fastest = validRows.length
    ? validRows.reduce((min, r) => (r.avg! < min.avg! ? r : min), validRows[0])
    : null;
  const slowest = validRows.length
    ? validRows.reduce((max, r) => (r.avg! > max.avg! ? r : max), validRows[0])
    : null;
  const avgLatency = validRows.length
    ? validRows.reduce((sum, r) => sum + r.avg!, 0) / validRows.length
    : null;

  return (
    <div className="space-y-3">
      {validRows.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <div className="flex flex-col justify-between p-3 rounded-xl cyber-card bg-card/60">
            <span className="text-[10px] font-mono tracking-wider text-muted-foreground uppercase">
              PROBES ({validRows.length})
            </span>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-lg font-bold font-mono text-primary">{validRows.length}</span>
              <span className="text-xs text-muted-foreground">/ {rows.length}</span>
            </div>
          </div>

          <div className="flex flex-col justify-between p-3 rounded-xl cyber-card bg-card/60">
            <span className="text-[10px] font-mono tracking-wider text-muted-foreground uppercase">
              {t('FASTEST (节点平均值最小)')}
            </span>
            <div className="mt-1">
              <span className="text-lg font-bold font-mono text-emerald-500">
                {fastest?.avg != null ? `${fastest.avg.toFixed(1)}ms` : '—'}
              </span>
              {fastest && (
                <div className="text-[11px] text-muted-foreground truncate mt-0.5 font-mono">
                  {fastest.name}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col justify-between p-3 rounded-xl cyber-card bg-card/60">
            <span className="text-[10px] font-mono tracking-wider text-muted-foreground uppercase">
              {t('AVERAGE (节点平均值的平均)')}
            </span>
            <div className="mt-1">
              <span className="text-lg font-bold font-mono text-sky-400">
                {avgLatency != null ? `${avgLatency.toFixed(1)}ms` : '—'}
              </span>
              <div className="text-[11px] text-muted-foreground mt-0.5 font-mono">
                {t('按节点均值计算')}
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-between p-3 rounded-xl cyber-card bg-card/60">
            <span className="text-[10px] font-mono tracking-wider text-muted-foreground uppercase">
              {t('SLOWEST (节点平均值最大)')}
            </span>
            <div className="mt-1">
              <span className="text-lg font-bold font-mono text-amber-500">
                {slowest?.avg != null ? `${slowest.avg.toFixed(1)}ms` : '—'}
              </span>
              {slowest && (
                <div className="text-[11px] text-muted-foreground truncate mt-0.5 font-mono">
                  {slowest.name}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <Card className="cyber-card">
        <CardContent className="p-0">
          <DataTable
            className="ping-table"
            getRowClassName={(row) =>
              row.avg == null ||
              !Number.isFinite(row.avg) ||
              row.avg < 0 ||
              row.status === t('失败')
                ? 'ping-row-danger'
                : row.avg < 100
                  ? 'ping-row-fast'
                  : row.avg < 400
                    ? 'ping-row-good'
                    : 'ping-row-slow'
            }
            data={rows}
            columns={columns}
            getRowId={(row) => row.id}
            animateChanges={false}
            animateSorting
            animateEntries
            empty={pending ? <Pending>{t('等待远端探针...')}</Pending> : t('暂无结果')}
          />
        </CardContent>
      </Card>
    </div>
  );
}
