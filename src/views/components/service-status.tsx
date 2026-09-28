import { useQuery } from '@tanstack/react-query';

import { ErrorNotice, Facts, PageHeading, Pending, ToolCard } from '@/components/toolkit';
import { UnderlineHover } from '@/components/underline-hover';
import { locale, t } from '@/i18n';
import { queryKeys } from '@/lib/query-keys';
import { getStatus } from '@/views/status/api';
import { presentStatus, statusLabelKey } from '@/views/status/presentation';
import services from '@/views/status/services.json';

function readableStatus(value: string | undefined, indicator?: string): string {
  return t(statusLabelKey(value, indicator));
}

export function ServiceStatusPage({ name }: { name: 'Claude (Anthropic)' | 'OpenAI' }) {
  const service = services.find((s) => s.name === name)!;
  const query = useQuery({
    queryKey: queryKeys.status.service(service.id),
    queryFn: ({ signal }) => getStatus(service.id, signal),
    retry: false,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
  const presented = presentStatus({
    url: service.url,
    isError: query.isError,
    isRefetchError: query.isRefetchError,
    data: query.data,
  });
  const stale = presented.stale;
  return (
    <>
      <PageHeading
        title={t('{0} 实时服务状态监控', [name])}
        description={t('来自官方状态接口的当前运行状态、组件状态与事件')}
      />
      <ErrorNotice error={query.error} />
      {query.isPending ? (
        <Pending>{t('正在读取官方状态…')}</Pending>
      ) : query.data ? (
        <>
          <ToolCard title={stale ? t('上次状态') : t('当前状态')}>
            <Facts
              rows={(() => {
                const rows: [string, string][] = [
                  [
                    t('状态'),
                    readableStatus(query.data.status?.description, query.data.status?.indicator),
                  ],
                  [
                    stale ? t('上次读取于') : t('读取于'),
                    new Date(query.data.fetchedAt).toLocaleString(locale),
                  ],
                ];
                if (query.data.evidence) rows.push([t('证据来源'), t(query.data.evidence.label)]);
                if (query.data.evidence?.note) rows.push([t('说明'), query.data.evidence.note]);
                return rows;
              })()}
            />
          </ToolCard>
          <section className="reading">
            <h2>{stale ? t('上次组件状态') : t('服务组件')}</h2>
            <Facts
              rows={(query.data.components ?? []).map((c) => [c.name, readableStatus(c.status)])}
            />
          </section>
          <section className="reading">
            <h2>{stale ? t('上次事件记录') : t('当前事件')}</h2>
            {query.data.incidents?.length ? (
              query.data.incidents.map((i) => (
                <ToolCard title={i.name} key={i.id}>
                  <p>
                    {readableStatus(i.status)}
                    {i.updated_at && ` · ${new Date(i.updated_at).toLocaleString(locale)}`}
                  </p>
                </ToolCard>
              ))
            ) : (
              <p className="muted">
                {stale
                  ? t('上次读取时没有未解决事件，当前情况待更新。')
                  : t('官方接口当前没有未解决事件。')}
              </p>
            )}
          </section>
        </>
      ) : null}
      <p className="principle">
        {t('历史可用率需要持续采样和存储，本页不使用抓取快照模拟历史监控。')}
        <UnderlineHover asChild>
          <a href={service.page} target="_blank" rel="noreferrer">
            {t('查看完整官方状态页 ↗')}
          </a>
        </UnderlineHover>
      </p>
    </>
  );
}
