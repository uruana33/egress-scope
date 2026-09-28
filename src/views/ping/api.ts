import { t } from '@/i18n';
import { endpoint } from '@/lib/network';

import {
  POLL_LIMIT,
  ResultCache,
  inputBatches,
  measurementKey,
  roundDelay,
} from './measurement-cache';

export interface PingResponse {
  reusedAt?: number;
  id: string;
  status: string;
  target: string;
  results: {
    probe: { country: string; city: string; network: string };
    result: {
      status: string;
      statusCode?: number;
      resolvedAddress?: string;
      timings?: { total?: number };
      stats?: { min: number; avg: number; max: number; loss: number };
      rawOutput?: string;
    };
  }[];
}

export type PingInput = {
  host: string;
  protocol?: 'icmp' | 'https';
  preferred?: boolean;
  nodes?: string[];
  regions?: string[];
  perRegion?: number;
};

export interface PingNode {
  id: string;
  cc: string;
  city: string;
  name: string;
  probes?: number;
  continent?: string;
  preferredAsn?: number;
  preferredNetwork?: string;
  preferredProbes?: number;
}

export const getPingNodes = (signal: AbortSignal) =>
  endpoint<PingNode[]>('/ping/nodes', { signal });

const cache = new ResultCache<PingResponse>();

function startMeasurement(input: PingInput, signal: AbortSignal) {
  return endpoint<{ id: string }>('/ping/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
}

async function pollUntilFinished(
  input: PingInput,
  signal: AbortSignal,
  onProgress?: (data: PingResponse) => void
) {
  const { id } = await startMeasurement(input, signal);
  for (let round = 0; round < POLL_LIMIT; round++) {
    signal.throwIfAborted();
    const data = await endpoint<PingResponse>(`/ping/result/${encodeURIComponent(id)}`, {
      signal,
    });
    signal.throwIfAborted();
    onProgress?.(data);
    if (data.status === 'finished') return data;
    await roundDelay(signal, round, t('已停止'));
  }
  throw new Error(t('部分节点尚未完成，可查看已返回结果或重新测试。'));
}

export async function runPing(
  input: PingInput,
  signal: AbortSignal,
  onProgress?: (data: PingResponse) => void
) {
  signal.throwIfAborted();
  const key = measurementKey(input);
  cache.prune(Date.now());

  const hit = cache.get(key);
  if (hit) {
    const data = { ...hit.data, reusedAt: hit.time };
    onProgress?.(data);
    return data;
  }

  const batches = inputBatches(input);
  if (!batches.length) throw new Error(t('请选择至少一个地区'));

  const collected: PingResponse['results'] = [];
  let final: PingResponse | undefined;
  for (const [index, batch] of batches.entries()) {
    signal.throwIfAborted();
    const lastBatch = index === batches.length - 1;
    final = await pollUntilFinished(batch, signal, (data) =>
      onProgress?.({
        ...data,
        status: lastBatch ? data.status : 'in-progress',
        results: [...collected, ...data.results],
      })
    );
    collected.push(...final.results);
  }

  const result = { ...final!, results: collected };
  cache.put(key, result, result.status);
  return result;
}
