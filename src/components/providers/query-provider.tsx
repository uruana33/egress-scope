import type { PropsWithChildren } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const QUERY_DEFAULTS = {
  networkMode: 'always',
  retry: 1,
  refetchOnWindowFocus: false,
} as const;

const client = new QueryClient({ defaultOptions: { queries: QUERY_DEFAULTS } });

export function QueryProvider({ children }: PropsWithChildren) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
