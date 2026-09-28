import { Link } from 'react-router-dom';

import { useQuery } from '@tanstack/react-query';

import { CountryFlag } from '@/components/country-flag';
import { NumberTicker } from '@/components/number-ticker';
import { ActionButton, Pending, ToolCard } from '@/components/toolkit';
import { t } from '@/i18n';
import { queryKeys } from '@/lib/query-keys';
import { lookupHref } from '@/views/lookup/href';

import { getPingNodes, runPing } from '../ping/api';
import { latencyCountries, selectLatencyNodes } from './latency-presets';

const countryNames: Record<string, string> = {
  us: t('美国'),
  de: t('德国'),
  gb: t('英国'),
  fr: t('法国'),
  jp: t('日本'),
  ca: t('加拿大'),
  cn: t('中国'),
  kr: t('韩国'),
};

const latencyColor = (latency: number) =>
  latency < 100 ? 'var(--success)' : latency < 250 ? 'var(--good)' : 'var(--warning)';

export function IpLatency({ ip, layout = 'card' }: { ip: string; layout?: 'card' | 'meter' }) {
  /**
   * The probe catalog describes the service, not the address, so it is cached
   * and shared with the full ping page instead of being refetched on every run.
   */
  const catalog = useQuery({
    queryKey: queryKeys.ping.catalog(),
    queryFn: ({ signal }) => getPingNodes(signal),
    staleTime: 300_000,
    retry: false,
  });

  /**
   * Results live in the query cache keyed by address rather than in local
   * state, so leaving and returning to the same IP keeps the last measurement
   * and no key-based remount is needed. Runs start only on demand; streamed
   * batches are written into the cache as they arrive, and the query signal
   * replaces the hand-managed AbortController.
   */
  const run = useQuery({
    queryKey: queryKeys.ip.latency(ip),
    enabled: false,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    retry: false,
    queryFn: async ({ signal, queryKey, client }) => {
      // Normally already cached; fetched here only if the catalog query failed.
      const selected = selectLatencyNodes(catalog.data ?? (await getPingNodes(signal)));
      const ids = selected.flatMap((item) => (item.node ? [item.node.id] : []));
      if (!ids.length) throw new Error(t('暂无可用优选探针'));
      return runPing({ host: ip, nodes: ids, preferred: true }, signal, (partial) =>
        client.setQueryData(queryKey, partial)
      );
    },
  });

  const busy = run.isFetching;
  const started = run.dataUpdatedAt > 0 || busy || run.isError;
  const data = run.data;
  const nodes = catalog.data
    ? selectLatencyNodes(catalog.data)
    : latencyCountries.map((cc) => ({ cc, node: undefined }));
  const error = run.error ? (run.error instanceof Error ? run.error.message : t('查询失败')) : '';

  const idle = !started && !data?.results.length && !error;
  const grid = idle ? (
    <p className="ip-latency-idle">{t('尚未测试全球延迟。')}</p>
  ) : (
    <div
      className={
        layout === 'meter'
          ? 'ip-folio-meter-grid'
          : 'ip-latency-grid grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-4'
      }>
      {nodes.map(({ cc, node }) => {
        const result = data?.results.find((item) => item.probe.country.toLowerCase() === cc);
        const stats = result?.result.stats;
        const latency =
          stats && stats.loss < 100 && Number.isFinite(stats.avg) ? stats.avg : undefined;
        return (
          <div
            key={cc}
            className={
              layout === 'meter'
                ? 'ip-folio-tick'
                : 'flex min-w-0 items-center justify-between gap-2 rounded-md bg-muted/30 px-2 py-2'
            }
            title={
              node
                ? `${node.city} · ${node.preferredNetwork ?? ''} · AS${node.preferredAsn}${stats ? ` · ${t('丢包')} ${stats.loss}%` : ''}`
                : undefined
            }>
            <div
              className={
                layout === 'meter'
                  ? 'ip-folio-tick-place'
                  : 'flex min-w-0 items-center gap-1.5 text-xs'
              }>
              <CountryFlag code={cc} />
              <span className="truncate">{countryNames[cc]}</span>
            </div>
            <div
              className={
                layout === 'meter'
                  ? 'ip-folio-tick-ms'
                  : 'shrink-0 text-sm font-semibold tabular-nums'
              }
              style={{
                color: latency == null ? undefined : latencyColor(latency),
              }}>
              {latency != null ? (
                <>
                  <NumberTicker value={latency} />
                  <span className="ml-1 text-xs font-normal">ms</span>
                </>
              ) : busy && (!result || result.result.status === 'in-progress') ? (
                <Pending>···</Pending>
              ) : (
                <span className="text-xs font-normal text-muted-foreground">
                  {!started
                    ? '—'
                    : !node
                      ? catalog.isSuccess
                        ? t('暂无优选探针')
                        : t('查询失败')
                      : t('未取得响应')}
                </span>
              )}
            </div>
            {stats && stats.loss > 0 && (
              <span className="shrink-0 text-[10px] text-destructive" title={t('丢包')}>
                <NumberTicker value={stats.loss} />%
              </span>
            )}
          </div>
        );
      })}
    </div>
  );

  const actions = (
    <span className="flex shrink-0 items-center gap-2">
      <Link
        className="text-xs font-normal text-muted-foreground hover:text-primary"
        to={lookupHref(ip, 'ping')}>
        {t('测更多地区')}
      </Link>
      <ActionButton
        size="sm"
        className="h-7 px-2 text-xs"
        variant="ghost"
        busy={busy}
        onClick={() => void run.refetch()}>
        {busy ? t('检测中…') : started ? t('重新检测') : t('开始测试')}
      </ActionButton>
    </span>
  );

  if (layout === 'meter') {
    return (
      <section className="ip-folio-meter">
        <div className="ip-folio-meter-head">
          <h3>{t('各地快不快')}</h3>
          {actions}
        </div>
        {grid}
        {error ? (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <ToolCard
      title={
        <span className="flex items-center justify-between gap-2">
          <span>{t('各地快不快')}</span>
          {actions}
        </span>
      }>
      {grid}
      {error && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </ToolCard>
  );
}
