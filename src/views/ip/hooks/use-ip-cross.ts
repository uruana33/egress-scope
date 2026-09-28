import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';

import { lookupCross } from '../api';

const FRESH_FOR = 5 * 60_000;

export function useIpCross(ip: string) {
  return useQuery({
    queryKey: queryKeys.ip.cross(ip),
    enabled: !!ip,
    staleTime: FRESH_FOR,
    gcTime: 30 * 60_000,
    retry: false,
    queryFn: async ({ signal }) => {
      try {
        return await lookupCross(ip, signal);
      } catch {
        return { ip, readings: [], unavailable: [] };
      }
    },
  });
}
