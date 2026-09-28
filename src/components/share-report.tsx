import { useEffect, useState } from 'react';

import { useNavigate } from 'react-router-dom';

import { toast } from 'sonner';

import { ActionButton } from '@/components/toolkit';
import { Button } from '@/components/ui/button';
import { t } from '@/i18n';
import { endpoint } from '@/lib/network';
import { type ReportSummary, reportShareText } from '@/lib/share-report';

export function ReportPrivacyNote() {
  return (
    <p className="small muted">
      {t(
        '本报告为用户主动生成的摘要快照，不含完整浏览器指纹；到期自动删除。WebRTC 检测在用户浏览器本地完成，本站不静默上报真实 ISP IP。'
      )}
    </p>
  );
}

async function createShareReport(summary: ReportSummary, ttlDays: 7 | 30 | 90) {
  return endpoint<{ id: string; url: string }>('/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      version: 1,
      client: 'web',
      summary,
      ttl_days: ttlDays,
    }),
  });
}

function useCopiedFlag() {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return [copied, setCopied] as const;
}

async function writeShareText(value: string) {
  await navigator.clipboard.writeText(value);
  toast.success(t('分享文案已复制'));
}

export function CopyShareTextButton({ value }: { value: string }) {
  const [copied, setCopied] = useCopiedFlag();
  const [fallback, setFallback] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          setCopied(false);
          setFallback(null);
          void writeShareText(value)
            .then(() => setCopied(true))
            .catch(() => {
              setCopied(false);
              setFallback(value);
              toast.error(t('自动复制失败，请长按或选中链接复制。'));
            });
        }}>
        {copied ? t('已复制') : t('复制分享文案')}
      </Button>
      {fallback ? (
        <pre className="docs-code overflow-x-auto p-3 text-xs whitespace-pre-wrap">{fallback}</pre>
      ) : null}
    </div>
  );
}

export function ShareReportButton({
  summary,
  ttlDays = 30,
}: {
  summary: ReportSummary;
  ttlDays?: 7 | 30 | 90;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useCopiedFlag();
  const [error, setError] = useState<string | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await createShareReport(summary, ttlDays);
      navigate(`/r/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('生成分享链接失败，请稍后重试'));
    } finally {
      setBusy(false);
    }
  };
  const copyBlurb = async () => {
    setCopying(true);
    setCopied(false);
    setError(null);
    setFallback(null);
    try {
      const created = await createShareReport(summary, ttlDays);
      const text = reportShareText({
        url: created.url || `${window.location.origin}/r/${created.id}`,
        summary,
      });
      try {
        await writeShareText(text);
        setCopied(true);
      } catch {
        setCopied(false);
        setFallback(text);
        toast.error(t('自动复制失败，请长按或选中链接复制。'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('生成分享链接失败，请稍后重试'));
    } finally {
      setCopying(false);
    }
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <ActionButton size="sm" busy={busy} disabled={copying} onClick={create}>
          {busy ? t('正在生成分享链接…') : t('生成分享链接')}
        </ActionButton>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || copying}
          aria-busy={copying}
          onClick={() => void copyBlurb()}>
          {copied ? t('已复制') : copying ? t('正在生成分享文案…') : t('复制分享文案')}
        </Button>
      </div>
      {error ? <p className="small muted">{error}</p> : null}
      {fallback ? (
        <pre className="docs-code overflow-x-auto p-3 text-xs whitespace-pre-wrap">{fallback}</pre>
      ) : null}
    </div>
  );
}
