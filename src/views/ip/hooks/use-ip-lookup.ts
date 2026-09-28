import { useEffect } from 'react';

import { useQuery } from '@tanstack/react-query';

import { useLookupHistory } from '@/hooks/use-lookup-history';
import { queryKeys } from '@/lib/query-keys';

import { lookupIp } from '../api';
import type { CoffeeLookup } from '../coffee';
import { describeLookupError, lookupRetryDelay, shouldRetryLookup } from '../model/errors';

export const IP_LOOKUP_HISTORY_KEY = 'egress-scope:coffee-history:v1';
const FRESH_FOR = 5 * 60_000;

export function useIpLookup(ip: string) {
  const history = useLookupHistory<CoffeeLookup>(IP_LOOKUP_HISTORY_KEY);
  const cached = history.find(ip);

  const query = useQuery({
    queryKey: queryKeys.ip.classification(ip),
    enabled: !!ip,
    /**
     * `placeholderData` rather than `initialData`: a stored snapshot should give
     * the page something to draw immediately, but it must not be written into
     * the cache. With `initialData` a snapshot younger than `staleTime` counted
     * as fresh, so no refresh was ever issued and the user silently read old
     * data with no indication of its age.
     */
    placeholderData: cached?.data,
    staleTime: FRESH_FOR,
    gcTime: 30 * 60_000,
    retry: shouldRetryLookup,
    retryDelay: lookupRetryDelay,
    // Kept pure: persistence is a side effect and lives in the effect below.
    queryFn: ({ signal }) => lookupIp(ip, signal),
  });

  const { data, isPlaceholderData } = query;
  useEffect(() => {
    if (data && !isPlaceholderData) history.save(ip, data);
    // `history.save` is stable per key; re-running on identity would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, isPlaceholderData, ip]);

  return {
    ...query,
    history,
    failure: describeLookupError(query.error),
    /** True while the page is showing a stored snapshot, not a live answer. */
    showingSnapshot: isPlaceholderData && !!cached,
    snapshotAt: cached?.savedAt,
  };
}
