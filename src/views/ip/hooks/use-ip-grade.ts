import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';

import { lookupGrade } from '../api';
import type { GradeOptions } from '../model/grade';

/**
 * 五门判定是手动触发的重型查询：八路公开源都有限流，
 * 不能跟着每次 IP 查询自动跑。enabled 由页面在用户点击后打开。
 */
export function useIpGrade(ip: string, options: GradeOptions, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.ip.grade(ip, JSON.stringify(options)),
    enabled: enabled && !!ip,
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    retry: false,
    queryFn: ({ signal }) => lookupGrade(ip, options, signal),
  });
}
