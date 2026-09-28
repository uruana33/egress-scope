import { t } from '@/i18n';

import { parseTrace, request } from '../../lib/network.ts';

export type AiProbeStatus = 'response' | 'restricted' | 'unknown';

export interface AiProbeOptions {
  /**
   * Number of sequential samples. The overview keeps the default at one
   * request; detail views can opt into the recommended three samples.
   */
  sampleCount?: number;
  /** Per-request timeout in milliseconds. */
  timeoutMs?: number;
}

export interface AiProbeResult {
  /** Successful latency in milliseconds, or -1 for a failed sample. */
  samples: number[];
  median: number | null;
  failures: number;
  status: AiProbeStatus;
  description: string;
}

export function probeCoverage(result: { samples: readonly number[]; failures?: number }) {
  const total = result.samples.length;
  const successful = result.samples.filter((sample) => sample >= 0).length;
  return {
    successful,
    total,
    partial: total > 0 && successful > 0 && successful < total,
  };
}

export const AI_OVERVIEW_SAMPLE_COUNT = 1;
export const AI_DETAIL_SAMPLE_COUNT = 3;
const MAX_SAMPLE_COUNT = 8;
const DEFAULT_TIMEOUT_MS = 3000;

type AttemptStatus = AiProbeStatus;

function normalizeSampleCount(value: number | undefined) {
  if (!Number.isFinite(value)) return AI_OVERVIEW_SAMPLE_COUNT;
  return Math.min(MAX_SAMPLE_COUNT, Math.max(1, Math.floor(value!)));
}

function normalizeTimeout(value: number | undefined) {
  if (!Number.isFinite(value)) return DEFAULT_TIMEOUT_MS;
  return Math.min(10_000, Math.max(100, Math.floor(value!)));
}

function isRestrictedError(error: unknown) {
  const status = (error as { httpStatus?: unknown })?.httpStatus;
  return status === 401 || status === 403 || status === 429;
}

function summarize(samples: number[]) {
  const successful = samples.filter((sample) => sample >= 0).sort((a, b) => a - b);
  if (!successful.length) return null;
  const middle = Math.floor(successful.length / 2);
  return Math.round(
    successful.length % 2 ? successful[middle] : (successful[middle - 1] + successful[middle]) / 2
  );
}

function finalStatus(outcomes: AttemptStatus[], successes: number) {
  if (successes > 0) return 'response' as const;
  if (outcomes.some((outcome) => outcome === 'restricted')) return 'restricted' as const;
  return 'unknown' as const;
}

function descriptionFor(domain: string, path: string, readable: boolean, status: AiProbeStatus) {
  if (status === 'restricted') return t('探测受限，站点可能要求验证或拒绝了跨域读取。');
  if (status === 'response') {
    return readable
      ? t('已读取并校验 {0} 的边缘网络响应；不代表登录、对话或验证码一定可用。', [domain])
      : t('收到 {0}{1} 的资源响应；不代表登录或对话可用，也无法读取跨域 HTTP 状态码。', [
          domain,
          path,
        ]);
  }
  return t('探测未取得有效响应（单次限时 3 秒），已跳过；可能超时、被内容拦截或受站点防护限制。');
}

export async function probeAiDomain(
  domain: string,
  signal?: AbortSignal,
  options: AiProbeOptions = {}
): Promise<AiProbeResult> {
  const readable = domain === 'claude.ai' || domain === 'www.perplexity.ai';
  const path = readable
    ? '/cdn-cgi/trace'
    : domain === 'gemini.google.com'
      ? '/robots.txt'
      : '/favicon.ico';
  const sampleCount = normalizeSampleCount(options.sampleCount);
  const timeoutMs = normalizeTimeout(options.timeoutMs);
  const samples: number[] = [];
  const outcomes: AttemptStatus[] = [];

  for (let attempt = 0; attempt < sampleCount; attempt++) {
    signal?.throwIfAborted();
    const start = performance.now();
    try {
      const requestSignal = signal
        ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
        : AbortSignal.timeout(timeoutMs);
      const body = await request<string>(
        `https://${domain}${path}`,
        {
          mode: readable ? 'cors' : 'no-cors',
          credentials: 'omit',
          cache: 'no-store',
          signal: requestSignal,
        },
        readable ? 'text' : 'opaque'
      );
      if (readable) {
        try {
          parseTrace(body);
        } catch {
          // A readable trace endpoint that returns a challenge page is an
          // access restriction, rather than an ordinary transport failure.
          throw Object.assign(new Error('trace response restricted'), {
            restricted: true,
          });
        }
      }
      samples.push(Math.round(performance.now() - start));
      outcomes.push('response');
    } catch (error) {
      if (signal?.aborted) throw error;
      samples.push(-1);
      outcomes.push(
        readable &&
          (isRestrictedError(error) || (error as { restricted?: unknown })?.restricted === true)
          ? 'restricted'
          : 'unknown'
      );
    }
  }

  const failures = samples.filter((sample) => sample < 0).length;
  const status = finalStatus(outcomes, samples.length - failures);
  return {
    samples,
    median: summarize(samples),
    failures,
    status,
    description: descriptionFor(domain, path, readable, status),
  };
}
