import { Link } from 'react-router-dom';

import { AlertTriangle, RotateCw, SearchX, WifiOff } from 'lucide-react';

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { t } from '@/i18n';
import { lookupHref } from '@/views/lookup/href';

import type { LookupErrorReport } from '../model/errors';

const icons = {
  missing: SearchX,
  offline: WifiOff,
  timeout: RotateCw,
  'rate-limited': AlertTriangle,
  upstream: AlertTriangle,
  malformed: AlertTriangle,
  unknown: AlertTriangle,
} as const;

/**
 * Replaces a bare `error.message` with the reason, its consequence and the one
 * action that can resolve it. "No record for this address" and "we were rate
 * limited" previously looked identical to the reader.
 */
export function LookupFailure({
  report,
  ip,
  busy,
  onRetry,
}: {
  report: LookupErrorReport;
  ip?: string;
  busy?: boolean;
  onRetry: () => void;
}) {
  const Icon = icons[report.kind];
  return (
    <Alert variant="destructive">
      <Icon aria-hidden="true" />
      <AlertTitle>{report.title}</AlertTitle>
      <AlertDescription>
        {report.description}
        {report.kind === 'missing' && ip ? (
          <>
            {' '}
            <Link to={lookupHref(ip, 'whois')}>{t('查看注册信息')}</Link>
          </>
        ) : null}
      </AlertDescription>
      {report.retryable ? (
        <AlertAction>
          <Button size="sm" variant="outline" disabled={busy} onClick={onRetry} aria-busy={busy}>
            {busy ? t('重试中…') : t('重试')}
          </Button>
        </AlertAction>
      ) : null}
    </Alert>
  );
}
