import { t } from '@/i18n';

export type LookupErrorKind =
  'missing' | 'rate-limited' | 'upstream' | 'timeout' | 'offline' | 'malformed' | 'unknown';

export interface LookupErrorReport {
  kind: LookupErrorKind;
  title: string;
  description: string;
  /** Whether the user pressing "retry" has a realistic chance of succeeding. */
  retryable: boolean;
}

function statusOf(error: unknown) {
  return typeof error === 'object' && error !== null && 'httpStatus' in error
    ? (error as { httpStatus?: number }).httpStatus
    : undefined;
}

function nameOf(error: unknown) {
  return error instanceof Error ? error.name : '';
}

/**
 * Turns a lookup failure into an outcome the page can act on. Without this the
 * view only has `error.message`, which cannot distinguish "this address has no
 * record" from "we were rate limited" even though the two need opposite advice.
 */
export function describeLookupError(error: unknown): LookupErrorReport | null {
  if (!error) return null;
  // A cancelled request is a navigation artefact, not a failure to report.
  if (nameOf(error) === 'AbortError') return null;
  const status = statusOf(error);
  if (status === 404)
    return {
      kind: 'missing',
      title: t('数据源暂无该地址的记录'),
      description: t('该地址可能未被收录，或属于不对外公布的网段。下方仍可查看注册信息。'),
      retryable: false,
    };
  if (status === 429)
    return {
      kind: 'rate-limited',
      title: t('查询过于频繁'),
      description: t('数据源已限流，请稍候再试。'),
      retryable: true,
    };
  if (status != null && status >= 500)
    return {
      kind: 'upstream',
      title: t('数据源暂时不可用'),
      description: t('上游服务返回了错误（{0}），稍后可再次尝试。', [status]),
      retryable: true,
    };
  if (status != null && status >= 400)
    return {
      kind: 'unknown',
      title: t('查询未能完成'),
      description: error instanceof Error ? error.message : t('请求被数据源拒绝。'),
      retryable: false,
    };
  if (nameOf(error) === 'TimeoutError')
    return {
      kind: 'timeout',
      title: t('查询超时'),
      description: t('数据源在限定时间内没有响应，可以重试一次。'),
      retryable: true,
    };
  if (nameOf(error) === 'ZodError')
    return {
      kind: 'malformed',
      title: t('数据源返回了无法解析的内容'),
      description: t('响应格式与预期不符，已停止渲染以免显示错误信息。'),
      retryable: true,
    };
  if (error instanceof TypeError)
    return {
      kind: 'offline',
      title: t('网络连接不可用'),
      description: t('无法连接数据源，请检查网络后重试。'),
      retryable: true,
    };
  return {
    kind: 'unknown',
    title: t('查询未能完成'),
    description: error instanceof Error ? error.message : String(error),
    retryable: true,
  };
}

const MAX_RETRIES = 2;

/**
 * Retries only failures that a second attempt can plausibly fix. A missing
 * record or a rejected request is retried forever otherwise, and a transient
 * blip currently fails outright because retries are disabled entirely.
 */
export function shouldRetryLookup(failureCount: number, error: unknown) {
  if (failureCount >= MAX_RETRIES) return false;
  return describeLookupError(error)?.retryable ?? false;
}

export const lookupRetryDelay = (attempt: number) => Math.min(1000 * 2 ** attempt, 8000);
