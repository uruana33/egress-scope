import { useQueries } from '@tanstack/react-query';

import { ActionButton } from '@/components/toolkit';
import { t } from '@/i18n';
import { request } from '@/lib/network';
import { CdnStage } from '@/views/egress/cdn-stage';
import { useEgressRun } from '@/views/egress/run-state';
import { useEgressHttpExits } from '@/views/egress/use-http-exits';

import { providers } from './providers';

export default function CdnPage() {
  const [round, setRound] = useEgressRun('cdn');
  const { httpExits, busy: referenceBusy } = useEgressHttpExits('cdn', round);
  const queries = useQueries({
    queries: providers.map((provider) => ({
      queryKey: ['cdn-node-v3', provider.id, round],
      retry: false,
      staleTime: 0,
      refetchOnWindowFocus: false,
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        if (provider.trace || provider.text) {
          const text = await request<string>(provider.url, { signal, cache: 'no-store' }, 'text');
          const node = provider.trace ? text.match(/^colo=(.+)$/m)?.[1]?.trim() : text.trim();
          if (!node || node.length > 200 || node.includes('<'))
            throw new Error(t('未返回有效节点标识'));
          return { node, cache: '—' };
        }
        const headers = await request<Headers>(
          provider.url,
          { signal, method: 'HEAD', cache: 'no-store' },
          'headers'
        );
        const values = (provider.headers ?? []).flatMap((key) => {
          const value = headers.get(key);
          if (!value) return [];
          if (key === 'xcc') {
            try {
              return [`${key}: ${atob(value)}`];
            } catch {
              return [];
            }
          }
          if (key === 'server' && !/bunnycdn-[\w-]+/i.test(value)) return [];
          return [`${key}: ${value}`];
        });
        if (!values.length) throw new Error(t('节点头未公开或跨域受限'));
        return {
          node: values.join(' · '),
          cache: headers.get('x-cache') ?? headers.get('cf-cache-status') ?? '—',
        };
      },
    })),
  });
  const busy = referenceBusy || queries.some((query) => query.isFetching);
  const hits = providers.map((provider, index) => ({
    id: provider.id,
    name: provider.name,
    family: provider.family,
    familyLabel: provider.familyLabel,
    path: provider.path,
    website: provider.website,
    url: provider.url,
    node: queries[index].isError ? undefined : queries[index].data?.node,
    cache: queries[index].isError ? undefined : queries[index].data?.cache,
    loading: queries[index].isFetching,
    error: queries[index].error?.message,
  }));
  return (
    <div className="space-y-3">
      <CdnStage
        hits={hits}
        busy={busy}
        httpExits={httpExits}
        action={
          <ActionButton size="sm" busy={busy} onClick={() => setRound((n) => n + 1)}>
            {busy ? t('检测中...') : t('重新检测')}
          </ActionButton>
        }
      />
    </div>
  );
}
