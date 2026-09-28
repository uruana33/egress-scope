import type { Geo } from '@/lib/types';
import { getBrowserIp, getDomesticIp, getGeo } from '@/views/home/api';

import type { DnsHttpExit } from './dns-lanes';

type Scope = 'dns' | 'cdn';
export type ReferenceQuery = {
  data?: Geo;
  isFetching: boolean;
  isError: boolean;
};

export function httpReferenceQueries(scope: Scope, round: number) {
  return (['domestic', 'overseas'] as const).map((path) => ({
    queryKey: ['egress', 'reference-v1', scope, round, path] as const,
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      path === 'domestic' ? getDomesticIp(signal) : getBrowserIp(4, signal),
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  }));
}

export function currentReference(query: ReferenceQuery): Geo | undefined {
  return query.isFetching || query.isError ? undefined : query.data;
}

export function httpReferenceGeoQuery(scope: Scope, round: number, ip?: string) {
  return {
    queryKey: ['egress', 'reference-geo-v1', scope, round, ip] as const,
    enabled: Boolean(ip),
    queryFn: ({ signal }: { signal: AbortSignal }) => getGeo(ip!, signal),
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  };
}

export function currentHttpExits(
  references: readonly ReferenceQuery[],
  geos: readonly ReferenceQuery[]
): DnsHttpExit[] {
  const [domestic, overseas] = references.map(currentReference);
  const values = [domestic?.ip !== overseas?.ip ? domestic : undefined, overseas];
  return values.flatMap((value, index) => {
    if (!value?.ip) return [];
    const geo = geos[index] ? currentReference(geos[index]) : undefined;
    return [
      {
        ...value,
        ...(geo?.ip === value.ip ? geo : undefined),
        ip: value.ip,
        path: index === 0 ? ('domestic' as const) : ('overseas' as const),
      },
    ];
  });
}
