import { useQuery } from '@tanstack/react-query';

import { CopyButton } from '@/components/copy-button';
import { CountryFlag } from '@/components/country-flag';
import { SiteLogo } from '@/components/site-logo';
import { IpText, Pending } from '@/components/toolkit';
import { locale, t } from '@/i18n';
import { queryKeys } from '@/lib/query-keys';
import { lookupCross, lookupIp } from '@/views/ip/api';
import { consensusPlace } from '@/views/ip/model/place';

import { attributeTags, regionTag } from './attribute-tags';
import type { DefaultExitSource } from './default-exit';
import { probeCoverage } from './probe';
import type { AiNetworkItem } from './use-ai-network';

function latencyTone(
  median: number | null | undefined,
  pending: boolean
): 'pending' | 'fail' | 'good' | 'ok' | 'slow' {
  if (pending && median == null) return 'pending';
  if (median == null || median < 0) return 'fail';
  if (median < 100) return 'good';
  if (median < 400) return 'ok';
  return 'slow';
}

function LatencyReadout({ item, pending }: { item: AiNetworkItem; pending: boolean }) {
  const { result } = item;
  const median = result?.median;
  const coverage = result ? probeCoverage(result) : null;
  if (pending && median == null)
    return (
      <span className="ai-hero-latency-value">
        <Pending>{t('检测中…')}</Pending>
      </span>
    );
  if (median == null)
    return (
      <span className="ai-hero-latency-value ai-hero-latency-none" title={result?.description}>
        <span>{result?.status === 'restricted' ? t('检测受限') : t('未确认')}</span>
        {coverage ? (
          <span className="ai-hero-latency-samples">
            {t('成功 {0}/{1}', [coverage.successful, coverage.total])}
          </span>
        ) : null}
        {item.resultStale && item.resultUpdatedAt ? (
          <span className="ai-hero-latency-samples">
            {t('上次结果 · {0}', [new Date(item.resultUpdatedAt).toLocaleString(locale)])}
          </span>
        ) : null}
      </span>
    );
  return (
    <span className="ai-hero-latency-value" title={result?.description}>
      <span>
        <span className="ai-hero-latency-number">{Math.round(median)}</span>
        <span className="ai-hero-latency-unit">ms</span>
      </span>
      {coverage ? (
        <span className="ai-hero-latency-samples">
          {t('成功 {0}/{1}', [coverage.successful, coverage.total])}
        </span>
      ) : null}
      {item.resultStale && item.resultUpdatedAt ? (
        <span className="ai-hero-latency-samples">
          {t('上次结果 · {0}', [new Date(item.resultUpdatedAt).toLocaleString(locale)])}
        </span>
      ) : null}
    </span>
  );
}

function ExitChip({ item }: { item: AiNetworkItem }) {
  const { platform, defaultExit } = item;
  if (!platform) return null;
  if (platform.traceDomain)
    return (
      <span
        className="ai-camp-exit-label"
        title={t('通过该平台可读取的 trace 端点测得，反映本次访问该平台端点的出口。')}>
        {t('平台实测出口')}
      </span>
    );
  if (defaultExit?.verdict === 'verified') {
    const ok = defaultExit.sources.filter((source) => source.ip);
    return (
      <span
        className="ai-camp-exit-label ai-camp-exit-label-good"
        title={t('{0} 个独立来源（{1}）返回相同出口，可信度高。', [
          ok.length,
          ok.map((source) => source.label).join(' · '),
        ])}>
        {t('HTTP 默认出口 · 已验证')}
      </span>
    );
  }
  if (defaultExit?.verdict === 'split') {
    const detail = defaultExit.sources
      .map((source) => `${source.label}: ${source.ip ?? '—'}`)
      .join(' · ');
    return (
      <span
        className="ai-camp-exit-label ai-camp-exit-label-warn"
        title={t('不同线路返回不同出口（{0}），存在分流；访问该平台的实际出口可能与显示值不同。', [
          detail,
        ])}>
        {t('观察到分流')}
      </span>
    );
  }
  if (defaultExit?.displaySource) {
    const source = defaultExit.displaySource;
    const label = defaultExitChipLabel(source);
    const title =
      source.transport === 'udp'
        ? t('仅 WebRTC/STUN 返回公网地址；这是 UDP 观察出口，不等于该 AI 平台的 HTTP 出口。')
        : t('该平台无实测接口；显示 {0} 看到的 HTTP 出口，可能不同于访问该平台的出口。', [
            source.label,
          ]);
    return (
      <span className="ai-camp-exit-label ai-camp-exit-label-muted" title={title}>
        {label}
      </span>
    );
  }
  return (
    <span
      className="ai-camp-exit-label ai-camp-exit-label-muted"
      title={t(
        '该平台无实测接口；检测会优先显示 HTTP 默认出口，只有 HTTP 不可用时才显示 UDP 观察出口。'
      )}>
      {t('HTTP 默认出口 · 待确认')}
    </span>
  );
}

function routeLabel(id: DefaultExitSource['id']): string {
  if (id === 'webrtc') return t('UDP 观察出口');
  if (id === 'worker') return t('HTTP 默认出口 · 本站接口');
  if (id === 'domestic') return t('HTTP 出口 · 国内 CDN');
  return t('HTTP 默认出口 · api.ip.sb');
}

function defaultExitChipLabel(source: DefaultExitSource): string {
  if (source.id === 'webrtc') return t('UDP 观察出口');
  if (source.id === 'worker') return t('HTTP 默认出口 · 本站接口');
  if (source.id === 'domestic') return t('HTTP 出口 · 国内 CDN');
  return t('HTTP 默认出口 · api.ip.sb');
}

function SplitRoute({ source }: { source: DefaultExitSource }) {
  const lookup = useQuery({
    queryKey: queryKeys.ip.classification(source.ip ?? ''),
    enabled: Boolean(source.ip),
    queryFn: ({ signal }) => lookupIp(source.ip!, signal),
    staleTime: 300_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const cross = useQuery({
    queryKey: queryKeys.ip.cross(source.ip ?? ''),
    enabled: Boolean(source.ip),
    queryFn: ({ signal }) => lookupCross(source.ip!, signal),
    staleTime: 300_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const geo = lookup.data?.geo;
  const crossData = cross.isError || cross.isFetching ? undefined : cross.data;
  const place = lookup.data ? consensusPlace(lookup.data.coffee, crossData ?? null) : undefined;
  const geoLine =
    place?.line !== '未知位置'
      ? place?.line
      : [geo?.country, geo?.city, geo?.isp].filter(Boolean).join(' · ') || null;
  const tags = lookup.data
    ? attributeTags(lookup.data.coffee, lookup.data.risk, crossData, {
        crossPending: cross.isFetching,
        crossError: cross.isError,
      })
    : null;
  return (
    <div className="ai-hero-route">
      <div className="ai-hero-route-head">
        <span className="ai-hero-route-label" title={source.label}>
          {routeLabel(source.id)}
        </span>
        <span className="ai-hero-ip">
          <IpText ip={source.ip} />
          {source.ip ? <CopyButton value={source.ip} className="ai-hero-copy" /> : null}
          {(place?.country_code ?? geo?.country_code) ? (
            <CountryFlag code={place?.country_code ?? geo?.country_code} />
          ) : null}
        </span>
      </div>
      <p className="ai-hero-geo" title={geoLine ?? undefined}>
        {source.ip && (lookup.isPending || lookup.isFetching) ? (
          <Pending>{t('查询归属…')}</Pending>
        ) : (
          (geoLine ?? (lookup.isError ? t('属性暂不可用') : t('归属未知')))
        )}
      </p>
      <div className="ai-camp-card-tags">
        {tags ? (
          tags.map((tag) => (
            <span key={tag.label} className={`ai-tag ai-tag-${tag.tone}`}>
              {tag.label}
            </span>
          ))
        ) : source.ip && (lookup.isPending || lookup.isFetching) ? (
          <span className="ai-tag ai-tag-muted">
            <Pending>{t('属性检测中…')}</Pending>
          </span>
        ) : (
          <span className="ai-tag ai-tag-muted">{t('属性暂不可用')}</span>
        )}
      </div>
    </div>
  );
}

export function CampCard({ item, pending }: { item: AiNetworkItem; pending: boolean }) {
  const { domain, platform, result, exit, lookup, cross } = item;
  if (!platform) return null;
  const isPlatformExit = Boolean(platform.traceDomain);
  const median = result?.median;
  const tone = latencyTone(median, pending);
  const online = median != null && !item.resultStale;
  const geo = lookup.data?.geo;
  const coffee = lookup.data?.coffee;
  const crossData = cross?.isError || cross?.isFetching ? undefined : cross?.data;
  const place = lookup.data ? consensusPlace(lookup.data.coffee, crossData ?? null) : undefined;
  const countryCode = place?.country_code ?? geo?.country_code ?? exit.countryCode;
  const geoLine =
    place?.line !== '未知位置'
      ? place?.line
      : [geo?.country, geo?.city, geo?.isp].filter(Boolean).join(' · ') || null;
  const asnLine = coffee
    ? [coffee.asn ? `AS${coffee.asn}` : null, coffee.asOrganization ?? coffee.asname]
        .filter(Boolean)
        .join(' · ') || null
    : null;
  const exitPending = exit.pending && !exit.ip;
  const exitIp = exit.ip;
  const splitSources =
    !isPlatformExit && item.defaultExit?.verdict === 'split'
      ? item.defaultExit.sources.filter((source) => source.ip)
      : null;
  const tags = lookup.data
    ? [
        ...attributeTags(coffee, lookup.data.risk, crossData, {
          crossPending: cross?.isFetching,
          crossError: cross?.isError,
        }),
        ...(() => {
          const tag = isPlatformExit ? regionTag(platform.camp, countryCode) : null;
          return tag ? [tag] : [];
        })(),
      ]
    : null;
  const evidenceLabel = isPlatformExit
    ? t('证据来源 · Cloudflare Trace')
    : item.defaultExit?.verdict === 'verified'
      ? t('证据来源 · 多来源 HTTP 交叉验证')
      : item.defaultExit?.verdict === 'split'
        ? t('证据来源 · 多线路观察')
        : exit.source
          ? t('证据来源 · {0}', [exit.source.label])
          : t('证据来源 · 默认出口观察');
  return (
    <article className="ai-hero-card" data-tone={tone}>
      <header className="ai-hero-head">
        <span className="ai-hero-identity">
          <span className="ai-hero-logo">
            <SiteLogo website={`https://${domain}`} className="size-6 rounded-sm" />
          </span>
          <span className="ai-hero-name-block">
            <span className="ai-hero-name">{platform.name}</span>
            <span className="ai-hero-domain">{domain}</span>
          </span>
        </span>
        <span className="ai-hero-latency">
          <span
            className={`ai-hero-status-dot${online ? ' ai-hero-status-live' : ''}`}
            aria-hidden="true"
          />
          <LatencyReadout item={item} pending={pending} />
        </span>
      </header>
      <div className="ai-hero-exit">
        <div className="ai-hero-exit-head">
          <ExitChip item={item} />
          {!splitSources &&
            (exitPending ? (
              <Pending>{t('检测中…')}</Pending>
            ) : exitIp ? (
              <span className="ai-hero-ip">
                <IpText ip={exitIp} />
                <CopyButton value={exitIp} className="ai-hero-copy" />
                {countryCode ? <CountryFlag code={countryCode} /> : null}
              </span>
            ) : (
              <span className="muted">
                {isPlatformExit ? t('暂不可用') : exit.configured ? t('检测失败') : t('未配置')}
              </span>
            ))}
        </div>
        <p className="ai-hero-evidence">
          {evidenceLabel}
          {isPlatformExit && platform.traceDomain ? <span> · {t('专属 trace 端点')}</span> : null}
        </p>
        {exit.stale && exit.updatedAt ? (
          <p className="ai-hero-evidence">
            {t('上次出口结果 · {0}', [new Date(exit.updatedAt).toLocaleString(locale)])}
          </p>
        ) : null}
        {splitSources ? (
          <div className="ai-hero-attributes">
            <div className="ai-hero-routes">
              {splitSources.map((source) => (
                <SplitRoute key={source.id} source={source} />
              ))}
            </div>
            <p className="ai-hero-split-note">
              {t('这些是探针观测的不同出口，平台实际出口尚未确认。')}
            </p>
          </div>
        ) : (
          <div className="ai-hero-attributes">
            <p className="ai-hero-geo" title={geoLine ?? undefined}>
              {exitIp && (lookup.isPending || lookup.isFetching) ? (
                <Pending>{t('查询归属…')}</Pending>
              ) : (
                (geoLine ?? (lookup.isError ? t('属性暂不可用') : t('归属未知')))
              )}
            </p>
            {lookup.isRefetchError && lookup.dataUpdatedAt ? (
              <p className="ai-hero-evidence">
                {t('上次属性结果 · {0}', [new Date(lookup.dataUpdatedAt).toLocaleString(locale)])}
              </p>
            ) : null}
            {asnLine ? <p className="ai-hero-asn">{asnLine}</p> : null}
            <div className="ai-camp-card-tags">
              {tags ? (
                tags.map((tag) => (
                  <span key={tag.label} className={`ai-tag ai-tag-${tag.tone}`}>
                    {tag.label}
                  </span>
                ))
              ) : exitIp && (lookup.isPending || lookup.isFetching) ? (
                <span className="ai-tag ai-tag-muted">
                  <Pending>{t('属性检测中…')}</Pending>
                </span>
              ) : (
                <span className="ai-tag ai-tag-muted">{t('属性暂不可用')}</span>
              )}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
