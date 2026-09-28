import { createConcurrencyLimiter, endpoint } from '@/lib/network';

export interface ServiceStatus {
  status: { indicator: string; description: string };
  evidence?: {
    kind: 'official' | 'reachability';
    label: string;
    note?: string;
    endpoints?: {
      label: string;
      url: string;
      transport: 'response' | 'failed';
      httpStatus?: number;
    }[];
  };
  incidents?: {
    id: string;
    name: string;
    status: string;
    updated_at?: string;
    shortlink?: string;
  }[];
  components?: { id: string; name: string; status: string }[];
  fetchedAt: string;
  checkedAt?: string;
  source: string;
}

/** Keep category expansion and manual refresh from opening a request storm. */
export const statusConcurrencyLimit = 6;
const statusLimiter = createConcurrencyLimiter(statusConcurrencyLimit);

export const getStatus = (id: string, signal?: AbortSignal) =>
  statusLimiter.run(signal, () => endpoint<ServiceStatus>(`/status/${id}`, { signal }));
