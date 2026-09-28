import { useEffect } from 'react';

import { useQuery } from '@tanstack/react-query';

import { CountryFlag } from '@/components/country-flag';
import { IpText, PageHeading, Pending, PrivacyToggle, ToolCard } from '@/components/toolkit';
import { locale, t } from '@/i18n';
import { type TraceResult, trace } from '@/lib/network';
import { queryKeys } from '@/lib/query-keys';
import { getDomesticIp, getGeo } from '@/views/home/api';

import { type DefaultExitResult, checkDefaultExit } from './default-exit';
import { AiNetworkCheck } from './network-check';
import { AiPlatformLinks } from './platform-links';
import type { AiPlatform } from './platforms';
import { AI_DETAIL_SAMPLE_COUNT } from './probe';

export default function PlatformDiagnostics({ platform }: { platform: AiPlatform }) {
  const exit = useQuery<TraceResult | DefaultExitResult>({
    queryKey: platform.traceDomain ? queryKeys.ai.exit(platform.id) : queryKeys.ai.defaultExit(),
    queryFn: ({ signal }) =>
      platform.traceDomain ? trace(platform.traceDomain!, signal) : checkDefaultExit(signal),
    staleTime: 60_000,
    retry: false,
  });
  const exitIp = exit.data?.ip;
  const observations = exit.data && 'sources' in exit.data ? exit.data.sources : null;
  const displaySource = exit.data && 'displaySource' in exit.data ? exit.data.displaySource : null;
  const traceData = exit.data && 'source' in exit.data ? exit.data : undefined;
  const geo = useQuery({
    queryKey: queryKeys.geo.byIp(exitIp),
    enabled: Boolean(exitIp),
    queryFn: ({ signal }) => getGeo(exitIp!, signal),
    staleTime: 60_000,
    retry: false,
  });
  const domestic = useQuery({
    queryKey: queryKeys.egress.domestic(),
    queryFn: ({ signal }) => getDomesticIp(signal),
    enabled: Boolean(platform.traceDomain),
    retry: false,
  });
  const cf = useQuery({
    queryKey: queryKeys.egress.cloudflare(),
    queryFn: ({ signal }) => trace('1.1.1.1', signal),
    retry: false,
  });
  useEffect(() => {
    document.title = t('{0} 网络出口检测 · 出口观测台', [platform.name]);
  }, [platform.name]);
  return (
    <div className="ai-diagnostics">
      <PageHeading
        title={t('{0}：出口与连通', [platform.name])}
        description={t('这是本次浏览器访问公开端点的观测结果，不是账号可用性证明。')}
      />
      <div className="ai-overview">
        <ToolCard
          title={
            <div className="flex items-center justify-between gap-3">
              <span>
                {platform.name}
                {t('出口')}
              </span>
              <PrivacyToggle />
            </div>
          }>
          <p className="small muted">
            {platform.traceDomain
              ? t('平台实测出口')
              : displaySource?.transport === 'udp'
                ? t('UDP 观察出口 · WebRTC/STUN')
                : displaySource
                  ? t('HTTP 出口 · {0}', [displaySource.label])
                  : t('HTTP 观测待确认')}
          </p>
          <div className="ip-value text-primary">
            {exit.isPending ? <Pending>{t('正在检测出口…')}</Pending> : <IpText ip={exitIp} />}
          </div>
          {exit.isRefetchError && exit.dataUpdatedAt ? (
            <p className="small muted">
              {t('上次出口结果 · {0}', [new Date(exit.dataUpdatedAt).toLocaleString(locale)])}
            </p>
          ) : null}
          <p className="text-xs leading-5 text-muted-foreground">
            {exit.isError ? (
              platform.traceDomain ? (
                t('出口查询失败，可能受网络或跨域限制。')
              ) : (
                t('浏览器出口查询失败，可能受网络或跨域限制。')
              )
            ) : geo.isFetching ? (
              <Pending>{t('查询归属信息…')}</Pending>
            ) : (
              <>
                <CountryFlag code={geo.data?.country_code} />{' '}
                {[geo.data?.country, geo.data?.city, geo.data?.isp].filter(Boolean).join(' · ') ||
                  t('归属信息暂不可用')}
              </>
            )}
          </p>
          <div className="ai-trace-meta" aria-live="polite">
            <span>
              {t('证据来源')}：{' '}
              {platform.traceDomain
                ? (traceData?.source ?? t('Cloudflare Trace'))
                : displaySource
                  ? t('默认出口观察 · {0}', [displaySource.label])
                  : t('默认出口交叉观察')}
            </span>
            {platform.traceDomain && traceData?.colo ? (
              <span>
                {t('接入节点 / POP')}：<code>{traceData.colo}</code>
              </span>
            ) : null}
          </div>
          {!platform.traceDomain && (
            <p className="text-xs leading-5 text-muted-foreground">
              {t(
                '此平台无可读取的专属出口接口；这些地址只代表各探测来源看到的线路，不能确认访问该平台的出口。'
              )}
            </p>
          )}
          {observations && (
            <div className="ai-exit-comparison">
              <span className="small muted">{t('各线路观测')}</span>
              {observations.map((source) => (
                <div className="ai-exit-row" key={source.id}>
                  <span className="muted">
                    {source.transport === 'udp'
                      ? t('UDP · {0}', [source.label])
                      : t('HTTP · {0}', [source.label])}
                  </span>
                  <span>
                    {source.ip ? (
                      <IpText ip={source.ip} />
                    ) : (
                      <span className="muted">{t('暂不可用')}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="ai-exit-comparison">
            <span className="small muted">{t('其他出口对照')}</span>
            {(platform.traceDomain
              ? [
                  { query: domestic, title: t('国内 IPv4') },
                  { query: cf, title: 'Cloudflare' },
                ]
              : [{ query: cf, title: 'Cloudflare' }]
            ).map(({ query, title }) => (
              <div className="ai-exit-row" key={title}>
                <span className="muted">{title}</span>
                <span>
                  {query.isPending ? (
                    <Pending>{t('检测中…')}</Pending>
                  ) : query.isError ? (
                    <span className="muted">{t('暂不可用')}</span>
                  ) : (
                    <IpText ip={query.data?.ip} />
                  )}
                </span>
              </div>
            ))}
            {(cf.isError || (platform.traceDomain && domestic.isError)) && (
              <p className="small muted">{t('对照出口可能受连接或跨域限制。')}</p>
            )}
          </div>
        </ToolCard>
        <AiNetworkCheck domains={[platform.domain]} sampleCount={AI_DETAIL_SAMPLE_COUNT}>
          <p className="small muted mt-3">{t('浏览器 HTTP 探测，不代表账号可用或模型权限。')}</p>
          <AiPlatformLinks platform={platform} />
        </AiNetworkCheck>
      </div>
    </div>
  );
}
