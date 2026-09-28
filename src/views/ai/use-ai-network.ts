import { useState } from 'react';

import { type UseQueryResult, useQueries, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

import { t } from '@/i18n';
import { trace } from '@/lib/network';
import { queryKeys } from '@/lib/query-keys';
import { withDetectionAnimation } from '@/lib/with-feedback';
import { lookupCross, lookupIp } from '@/views/ip/api';
import type { CoffeeLookup } from '@/views/ip/coffee';
import type { CrossIntel } from '@/views/ip/model/cross-intel';

import { type DefaultExitResult, type DefaultExitSource, checkDefaultExit } from './default-exit';
import { type AiPlatform, aiPlatforms } from './platforms';
import { AI_OVERVIEW_SAMPLE_COUNT, type AiProbeResult, probeAiDomain } from './probe';
import { selectRefreshableAiQueries } from './query-refresh';

export type ExitInfo = {
  ip?: string;
  countryCode?: string;
  source?: DefaultExitSource;
  pending: boolean;
  failed: boolean;
  configured: boolean;
  stale?: boolean;
  updatedAt?: number;
};

export type AiNetworkItem = {
  domain: string;
  platform: AiPlatform | undefined;
  result: AiProbeResult | undefined;
  resultStale?: boolean;
  resultUpdatedAt?: number;
  exit: ExitInfo;
  /** Cross-checked default egress; present only on platforms without a trace endpoint. */
  defaultExit?: DefaultExitResult;
  lookup: UseQueryResult<CoffeeLookup, Error>;
  cross?: UseQueryResult<CrossIntel, Error>;
};

export function useAiNetworkQueries(domains: string[], sampleCount = AI_OVERVIEW_SAMPLE_COUNT) {
  const [refreshing, setRefreshing] = useState(false);
  const probeQuery = useQuery({
    queryKey: [...queryKeys.ai.network(domains), sampleCount],
    queryFn: ({ signal }) =>
      Promise.all(domains.map((domain) => probeAiDomain(domain, signal, { sampleCount }))),
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const platforms = domains.map((domain) =>
    aiPlatforms.find((platform) => platform.domain === domain)
  );
  const needsDefaultExit = platforms.some((platform) => platform && !platform.traceDomain);
  const defaultExitQuery = useQuery({
    queryKey: queryKeys.ai.defaultExit(),
    queryFn: ({ signal }) => checkDefaultExit(signal),
    enabled: needsDefaultExit,
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const exits = useQueries({
    queries: platforms.map((platform, index) => ({
      queryKey: queryKeys.ai.exit(platform?.id ?? domains[index]),
      enabled: Boolean(platform?.traceDomain),
      queryFn: ({ signal }: { signal: AbortSignal }) => {
        const traceDomain = platform?.traceDomain;
        if (!traceDomain) throw new Error('AI platform has no trace endpoint');
        return trace(traceDomain, signal);
      },
      staleTime: 60_000,
      retry: false,
      refetchOnWindowFocus: false,
    })),
  });
  const busy =
    refreshing ||
    probeQuery.isFetching ||
    (needsDefaultExit && defaultExitQuery.isFetching) ||
    exits.some((exit) => exit.isFetching);
  const exitInfos: ExitInfo[] = platforms.map((platform, index) => {
    if (!platform) {
      return {
        pending: false,
        failed: false,
        configured: false,
      };
    }
    if (platform?.traceDomain) {
      const query = exits[index];
      return {
        ip: query.data?.ip,
        countryCode: query.data?.country_code,
        pending: query.isFetching,
        failed: query.isError,
        configured: true,
        stale: query.isRefetchError,
        updatedAt: query.dataUpdatedAt || undefined,
      };
    }
    return {
      ip: defaultExitQuery.data?.ip,
      source: defaultExitQuery.data?.displaySource,
      pending: needsDefaultExit && defaultExitQuery.isFetching,
      failed: defaultExitQuery.isError || defaultExitQuery.data?.verdict === 'failed',
      configured: true,
      stale: defaultExitQuery.isRefetchError,
      updatedAt: defaultExitQuery.dataUpdatedAt || undefined,
    };
  });
  const lookups = useQueries({
    queries: exitInfos.map((exit) => {
      const ip = exit.ip;
      return {
        queryKey: queryKeys.ip.classification(ip ?? ''),
        enabled: Boolean(ip),
        queryFn: ({ signal }: { signal: AbortSignal }) => {
          if (!ip) throw new Error('AI exit IP is unavailable');
          return lookupIp(ip, signal);
        },
        staleTime: 300_000,
        retry: false,
        refetchOnWindowFocus: false,
      };
    }),
  });
  const attributeIps = [
    ...new Set([
      ...exitInfos.flatMap((exit) => (exit.ip ? [exit.ip] : [])),
      ...(defaultExitQuery.data?.sources ?? []).flatMap((source) => (source.ip ? [source.ip] : [])),
    ]),
  ];
  const crossQueries = useQueries({
    queries: attributeIps.map((ip) => ({
      queryKey: queryKeys.ip.cross(ip),
      enabled: true,
      queryFn: ({ signal }: { signal: AbortSignal }) => lookupCross(ip, signal),
      staleTime: 300_000,
      retry: false,
      refetchOnWindowFocus: false,
    })),
  });
  const crossByIp = new Map(attributeIps.map((ip, index) => [ip, crossQueries[index]] as const));
  const attributesBusy = crossQueries.some((cross) => cross.isFetching);
  const items: AiNetworkItem[] = domains.map((domain, index) => ({
    domain,
    platform: platforms[index],
    result: probeQuery.data?.[index],
    resultStale: probeQuery.isRefetchError && Boolean(probeQuery.data),
    resultUpdatedAt: probeQuery.dataUpdatedAt || undefined,
    exit: exitInfos[index],
    defaultExit:
      platforms[index] && !platforms[index].traceDomain ? defaultExitQuery.data : undefined,
    lookup: lookups[index],
    cross: exitInfos[index].ip ? crossByIp.get(exitInfos[index].ip) : undefined,
  }));
  if (probeQuery.data)
    items.sort((a, b) => {
      const aDown = a.result?.median == null;
      const bDown = b.result?.median == null;
      if (aDown !== bDown) return aDown ? -1 : 1;
      return (a.result?.median ?? Infinity) - (b.result?.median ?? Infinity);
    });

  const refresh = async () => {
    setRefreshing(true);
    try {
      const traceQueries = selectRefreshableAiQueries(
        exits,
        platforms.map((platform) => Boolean(platform?.traceDomain))
      );
      const lookupQueries = selectRefreshableAiQueries(
        lookups,
        exitInfos.map((exit) => Boolean(exit.ip))
      );
      const crossRefreshQueries = selectRefreshableAiQueries(
        crossQueries,
        attributeIps.map(() => true)
      );
      const [next] = await withDetectionAnimation(() =>
        Promise.all([
          probeQuery.refetch({ throwOnError: true }),
          needsDefaultExit ? defaultExitQuery.refetch() : Promise.resolve(null),
          ...traceQueries.map((exit) => exit.refetch()),
          ...lookupQueries.map((lookup) => lookup.refetch()),
          ...crossRefreshQueries.map((cross) => cross.refetch()),
        ])
      );
      if (next.data?.every((result) => result.median != null)) toast.success(t('网络检测完成'));
      else toast.warning(t('检测完成，部分站点未获取到响应'));
    } catch {
      toast.error(t('网络检测失败，请重试'));
    } finally {
      setRefreshing(false);
    }
  };

  return { probeQuery, busy: busy || attributesBusy, items, refresh };
}
