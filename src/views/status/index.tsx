import { useEffect, useMemo } from 'react';

import { useSearchParams } from 'react-router-dom';

import { useQueries, useQueryClient } from '@tanstack/react-query';

import { PageHeading } from '@/components/toolkit';
import { t } from '@/i18n';
import { queryKeys } from '@/lib/query-keys';

import { getStatus } from './api';
import { statusLoadBatch, statusLoadIds } from './loading';
import { statusOrder } from './order';
import { presentSummary } from './presentation';
import { type ServiceRow, indicatorOf, severityRank } from './row-model';
import rawservices from './services.json';
import { FlipCard } from './status-cards';
import { IssueAlert, StatusHero } from './status-hero';

const services = rawservices.map((item) => ({
  ...item,
  name: t(item.name),
  note: item.note ? t(item.note) : item.note,
}));

const GROUPS: [string, string][] = [
  ['AI', 'AI PLATFORMS'],
  ['云服务', 'CLOUD & HOSTING'],
  ['网络基础设施', 'NETWORK & EDGE'],
  ['开发', 'DEV TOOLS'],
  ['数据服务', 'DATA SERVICES'],
  ['监控与安全', 'OBSERVABILITY & SECURITY'],
  ['消息与邮件', 'MESSAGING & EMAIL'],
  ['媒体与内容', 'MEDIA & CONTENT'],
  ['协作与办公', 'COLLABORATION & WORK'],
  ['支付与电商', 'PAYMENTS & COMMERCE'],
  ['VPS', 'VPS / SERVERS'],
  ['社区', 'COMMUNITY'],
];

function GroupSection({
  group,
  subtitle,
  items,
  expanded,
  focusId,
  onToggle,
}: {
  group: string;
  subtitle: string;
  items: ServiceRow[];
  expanded: boolean;
  focusId: string | null;
  onToggle: () => void;
}) {
  const issueCount = items.filter((row) => statusOrder(indicatorOf(row)) === 0).length;
  const worst = indicatorOf(items.reduce((a, b) => (severityRank(a) <= severityRank(b) ? a : b)));
  return (
    <section className={`sw-card${expanded ? ' sw-card-open' : ''}`}>
      <button
        type="button"
        className="sw-card-head"
        aria-expanded={expanded}
        aria-label={t('{0} 服务列表', [t(group)])}
        onClick={onToggle}>
        <span className="sw-card-id">
          <i className={`sw-block sw-card-dot sw-${worst}`} aria-hidden="true" />
          <span className="sw-card-name">{t(group)}</span>
          <span className="sw-card-sub">{subtitle}</span>
        </span>
        <span className="sw-card-meta">
          {items.length}
          {t('个服务')}
          {issueCount > 0 && <em className="sw-card-issues">{t('{0} 个异常', [issueCount])}</em>}
        </span>
        <span className="sw-mini-strip" aria-hidden="true">
          {items.map((row) => (
            <i key={row.id} className={`sw-mini-bar sw-${indicatorOf(row)}`} />
          ))}
        </span>
        <span className="sw-card-chevron" aria-hidden="true">
          ▸
        </span>
      </button>
      <div className="sw-card-body">
        <div className="sw-card-body-inner">
          {items.map((row, index) => (
            <FlipCard key={row.id} row={row} index={index} focused={row.id === focusId} />
          ))}
        </div>
      </div>
    </section>
  );
}

export default function StatusPage() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const focusId = params.get('service');
  const focusService = services.find((service) => service.id === focusId);
  const filter = params.get('group') ?? focusService?.group ?? '';
  const loadScope = filter || '全部';
  const loadBatch = statusLoadBatch(
    services,
    (service) => {
      const state = queryClient.getQueryState(queryKeys.status.service(service.id));
      return state?.status === 'success' || state?.status === 'error';
    },
    loadScope
  );
  const requestedIds = useMemo(
    () => statusLoadIds(services, loadScope, focusId, loadBatch),
    [focusId, loadBatch, loadScope]
  );
  const queries = useQueries({
    queries: services.map((s) => ({
      queryKey: queryKeys.status.service(s.id),
      enabled: Boolean(s.url) && requestedIds.has(s.id),
      queryFn: ({ signal }: { signal: AbortSignal }) => getStatus(s.id, signal),
      retry: false,
      staleTime: 60_000,
      refetchInterval: 120_000,
    })),
  });
  const pending = queries.some((q, index) => requestedIds.has(services[index].id) && q.isFetching);
  const allRows: ServiceRow[] = services.map((service, i) => ({
    ...service,
    requested: requestedIds.has(service.id),
    query: queries[i],
  }));
  const rows = allRows.filter((s) => filter === '' || filter === '全部' || s.group === filter);
  const issueRows = rows
    .filter((row) => statusOrder(indicatorOf(row)) === 0)
    .sort((a, b) => severityRank(a) - severityRank(b));
  const summary = presentSummary(
    rows.map((row) => ({
      url: row.url,
      requested: row.requested,
      isPending: row.query.isPending,
      isError: row.query.isError,
      isRefetchError: row.query.isRefetchError,
      data: row.query.data,
    }))
  );

  useEffect(() => {
    document.title = t('AI 与云服务官方状态 · 出口观测台');
  }, []);

  const groups = GROUPS.map(([group, subtitle]) => ({
    group,
    subtitle,
    items: allRows
      .filter((row) => row.group === group)
      .sort((a, b) => severityRank(a) - severityRank(b)),
  })).filter(({ items }) => items.length > 0);

  const refreshAll = () =>
    void Promise.all(
      queries
        .filter((_, index) => services[index].url && requestedIds.has(services[index].id))
        .map((q) => q.refetch())
    );

  return (
    <div className="status-wall">
      <PageHeading
        title={t('服务状态')}
        description={t(
          '优先读取官方状态；无官方状态页时降级为可达性参考，并明确标注「仅供参考」。'
        )}
      />
      <StatusHero
        rows={rows}
        issueRows={issueRows}
        healthyCount={summary.healthyCount}
        unknownCount={summary.unknownCount}
        headlineKey={summary.headlineKey}
        pending={pending}
        onRefresh={refreshAll}
      />
      <div className="sw-toolbar">
        <button
          type="button"
          className={`sw-all-chip${filter === '全部' ? ' sw-all-chip-on' : ''}`}
          onClick={() => setParams(filter === '全部' ? {} : { group: '全部' })}
          aria-pressed={filter === '全部'}>
          {filter === '全部' ? t('全部收起') : t('全部展开')}
        </button>
        <span className="sw-toolbar-hint">{t('点击卡片展开对应分组')}</span>
      </div>
      <IssueAlert issueRows={issueRows} />
      <div className="sw-groups">
        {groups.map(({ group, subtitle, items }) => (
          <GroupSection
            key={group}
            group={group}
            subtitle={subtitle}
            items={items}
            expanded={filter === '全部' || filter === group}
            focusId={focusId}
            onToggle={() => setParams(filter === group ? {} : { group })}
          />
        ))}
      </div>
      <p className="small muted">{t('每 2 分钟自动检查。未知或查询失败不等于服务故障。')}</p>
    </div>
  );
}
