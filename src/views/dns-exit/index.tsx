import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';

import { ErrorNotice } from '@/components/toolkit';
import { DnsRetryButton, DnsStage } from '@/views/egress/dns-stage';
import { useEgressRun } from '@/views/egress/run-state';
import { useEgressHttpExits } from '@/views/egress/use-http-exits';

import { type DnsProgress, detectDnsExits } from './api';

export default function DnsExitPage() {
  const [round, setRound] = useEgressRun('dns');
  const { httpExits, busy: referenceBusy } = useEgressHttpExits('dns', round);
  const client = useQueryClient();
  const progressKey = ['dns-exit-progress', round];
  const progress = useQuery<DnsProgress>({
    queryKey: progressKey,
    enabled: false,
    queryFn: skipToken,
  });
  const query = useQuery({
    queryKey: ['dns-exit', round],
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) =>
      detectDnsExits(signal, (state) => {
        client.setQueryData(progressKey, state);
      }),
  });
  const state = query.isFetching || query.isError ? progress.data : (query.data ?? progress.data);
  const busy = query.isFetching || referenceBusy;
  return (
    <div className="space-y-3">
      <DnsStage
        state={state}
        busy={busy}
        httpExits={httpExits}
        action={<DnsRetryButton busy={busy} onClick={() => setRound((n) => n + 1)} />}
      />
      <ErrorNotice error={query.error} />
    </div>
  );
}
