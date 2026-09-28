import { useEffect, useMemo, useState } from 'react';

import { Link } from 'react-router-dom';

import { useQueries, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CircleHelp, LoaderCircle, ScanSearch, ShieldCheck, Split } from 'lucide-react';

import { ShareReportButton } from '@/components/share-report';
import { ActionButton } from '@/components/toolkit';
import { t } from '@/i18n';
import { isHomeQueryKey, queryKeys } from '@/lib/query-keys';
import { buildHomeShareSummary, flagsFromCoffee, saveShareDraft } from '@/lib/share-report';
import { lookupCross, lookupIp } from '@/views/ip/api';
import { assessQuality } from '@/views/ip/model/quality';

import { getBrowserIp, getDomesticIp, getGeo } from './api';
import './home-visual.css';
import { assessHomeExits, selectHomeCards } from './overview';
import { SplitTunnelVisualizer } from './split-tunnel-visualizer';

export function HomePage() {
  const client = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    const filters = {
      predicate: (query: { queryKey: readonly unknown[] }) => isHomeQueryKey(query.queryKey),
    };
    try {
      await client.cancelQueries(filters);
      await client.resetQueries(filters);
    } finally {
      setRefreshing(false);
    }
  };
  useEffect(() => {
    document.title = t('出口IP检测 / WebRTC / DNS / IP质量 · 出口观测台');
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute(
        'content',
        t('对照国内与海外出口是否按规则走，检查 WebRTC／DNS 泄露，查看 IP 质量分与机房／代理标记。')
      );
  }, []);
  const probes = useQueries({
    queries: [
      {
        queryKey: queryKeys.egress.domestic(),
        retry: false,
        queryFn: ({ signal }: { signal: AbortSignal }) => getDomesticIp(signal),
      },
      {
        queryKey: queryKeys.home.browserIp(),
        queryFn: ({ signal }: { signal: AbortSignal }) => getBrowserIp(4, signal),
      },
    ].map((probe) => ({ retry: false, staleTime: 60_000, ...probe })),
  });
  const cards = selectHomeCards(probes).map((card) => ({
    ...card,
    version: 4,
    label:
      card.role === 'shared'
        ? t('IPv4 · 两次探测一致')
        : card.role === 'domestic'
          ? t('IPv4 · 国内探测')
          : t('IPv4 · 外部探测'),
  }));
  const ips = [...new Set(cards.flatMap(({ data }) => (data ? [data.ip] : [])))];
  const geoQueries = useQueries({
    queries: ips.map((ip) => ({
      queryKey: queryKeys.geo.byIp(ip),
      queryFn: ({ signal }: { signal: AbortSignal }) => getGeo(ip, signal),
      staleTime: 60_000,
      retry: false,
    })),
  });
  const geoByIp = new Map(ips.map((ip, index) => [ip, geoQueries[index]]));
  const typeQueries = useQueries({
    queries: ips.map((ip) => ({
      queryKey: queryKeys.ip.classification(ip),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        lookupIp(ip, AbortSignal.any([signal, AbortSignal.timeout(3000)])),
      staleTime: 5 * 60_000,
      retry: false,
      refetchOnWindowFocus: false,
    })),
  });
  const typeByIp = new Map(ips.map((ip, index) => [ip, typeQueries[index]]));
  const crossQueries = useQueries({
    queries: ips.map((ip) => ({
      queryKey: queryKeys.ip.cross(ip),
      queryFn: ({ signal }: { signal: AbortSignal }) => lookupCross(ip, signal),
      staleTime: 5 * 60_000,
      gcTime: 30 * 60_000,
      retry: false,
      refetchOnWindowFocus: false,
    })),
  });
  const crossByIp = new Map(ips.map((ip, index) => [ip, crossQueries[index]]));
  const domesticCard = cards.find((card) => card.role === 'domestic' || card.role === 'shared');
  const overseasCard = cards.find((card) => card.role === 'external' || card.role === 'shared');
  const domesticGeo = domesticCard?.data ? geoByIp.get(domesticCard.data.ip)?.data : undefined;
  const overseasGeo = overseasCard?.data ? geoByIp.get(overseasCard.data.ip)?.data : undefined;

  const cardsData = cards.map(({ query, data, version, label, role }, index) => {
    const pending = !data && query.isPending;
    const geo = data ? { ...data, ...geoByIp.get(data.ip)?.data } : undefined;
    const classification = data ? typeByIp.get(data.ip) : undefined;
    const company = classification?.data?.coffee;
    const cross = data ? crossByIp.get(data.ip) : undefined;
    const assessment = company
      ? assessQuality(
          company,
          cross?.data ?? (cross?.isError ? { ip: data.ip, readings: [], unavailable: [] } : null),
          {
            pending: Boolean(cross?.isFetching && !cross.data),
          }
        )
      : null;
    const score = assessment?.score ?? undefined;
    const hasScore = assessment?.score != null;
    const typeLabels = assessment
      ? [
          {
            label: assessment.kindLabel,
            color:
              assessment.kind === 'disputed'
                ? 'bg-amber-500/12 text-foreground'
                : 'bg-primary/5 text-primary',
          },
        ]
      : [];
    const loading = pending || Boolean(data && geoByIp.get(data.ip)?.isPending);
    return {
      index,
      role,
      assessment,
      probeStale: Boolean(query.isError),
      stale: query.isError || Boolean(classification?.isError || cross?.isError),
      label,
      data,
      geo,
      version,
      hasScore,
      score,
      typeLabels,
      loading,
      pending,
      onRetry: () => data && geoByIp.get(data.ip)?.refetch(),
    };
  });
  const verdictState = assessHomeExits(probes);
  const verdictText =
    verdictState === 'pending'
      ? t('正在探测出口…')
      : verdictState === 'different'
        ? t('本轮观测到不同出口——分流可能已生效，建议再做网站分流核对。')
        : verdictState === 'same'
          ? t('两次探测观察到同一公网出口。')
          : verdictState === 'partial'
            ? t('仅取得一侧探测结果，尚不能比较出口。')
            : t('暂未获取到出口地址。');
  const qualityIp = overseasCard?.data?.ip ?? domesticCard?.data?.ip ?? null;
  const qualityCard = cardsData.find((card) => card.data?.ip === qualityIp);
  const qualityGeo = qualityIp ? geoByIp.get(qualityIp)?.data : undefined;
  const qualityCoffee = qualityIp ? typeByIp.get(qualityIp)?.data?.coffee : undefined;
  const shareSummary = useMemo(
    () =>
      buildHomeShareSummary({
        verdict: verdictState,
        domesticIp: domesticCard?.data?.ip ?? null,
        overseasIp: overseasCard?.data?.ip ?? null,
        qualityScore: qualityCard?.score ?? null,
        asn: qualityGeo?.asn ?? qualityCoffee?.asn ?? null,
        isp: qualityGeo?.isp ?? qualityCoffee?.isp ?? null,
        flags: flagsFromCoffee(qualityCoffee),
      }),
    [
      verdictState,
      domesticCard?.data?.ip,
      overseasCard?.data?.ip,
      qualityCard?.score,
      qualityGeo?.asn,
      qualityGeo?.isp,
      qualityCoffee,
    ]
  );
  useEffect(() => {
    if (shareSummary) saveShareDraft(shareSummary);
  }, [shareSummary]);
  const VerdictIcon =
    verdictState === 'pending'
      ? LoaderCircle
      : verdictState === 'different'
        ? Split
        : verdictState === 'same'
          ? ShieldCheck
          : CircleHelp;

  return (
    <div className="home-page">
      <header className="home-hero flex items-start justify-between gap-3 flex-wrap">
        <div className="home-hero-copy min-w-0">
          <p className="home-hero-eyebrow">
            <ScanSearch className="size-3" aria-hidden="true" />
            {t('代理／分流用户专用')}
          </p>
          <h1 className="home-hero-title">{t('出口观测台')}</h1>
          <p className="home-hero-sub">
            {t(
              '国内与海外双探针对照真实出口，并同步查看质量分与机房／代理特征标记。不承诺任何平台的通过率。'
            )}
          </p>
          <div className="home-hero-ctas">
            <Link to="/network/egress" className="home-cta home-cta-primary">
              {t('检测分流出口')}
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
            <Link to="/network/ip" className="home-cta">
              {t('查看 IP 质量分')}
            </Link>
            <Link to="/ai/" className="home-cta">
              {t('AI 平台出口与状态')}
            </Link>
          </div>
        </div>
        <ActionButton size="sm" busy={refreshing} onClick={refresh} className="shrink-0">
          {refreshing ? t('检测中...') : t('重新检测')}
        </ActionButton>
      </header>
      <p className="home-verdict" data-state={verdictState}>
        <VerdictIcon className="home-verdict-icon" aria-hidden="true" />
        <span className="min-w-0">{verdictText}</span>
      </p>
      {shareSummary ? <ShareReportButton summary={shareSummary} /> : null}
      <SplitTunnelVisualizer
        isSplit={cards.length > 1}
        cardsData={cardsData}
        domesticIp={domesticCard?.data?.ip}
        domesticGeo={domesticGeo}
        domesticPending={probes[0].isFetching}
        overseasIp={overseasCard?.data?.ip}
        overseasGeo={overseasGeo}
        overseasPending={probes[1].isFetching}
      />
    </div>
  );
}

export default HomePage;
