import { useEffect, useState } from 'react';

import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';

import { t } from '@/i18n';

import { Button } from './ui/button';

export function CopyButton({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setCopied(false);
  }, [value]);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  const label = copied ? t('已复制') : t('复制');
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className={className}
      aria-label={label}
      title={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
        } catch {
          toast.error(t('自动复制失败，请长按或选中链接复制。'));
        }
      }}>
      <span className="icon-swap-container size-3.5" data-state={copied ? 'active' : 'idle'}>
        <span className="icon-swap-item icon-swap-idle flex items-center justify-center">
          <Copy className="size-3.5" aria-hidden="true" />
        </span>
        <span className="icon-swap-item icon-swap-active flex items-center justify-center text-good">
          <Check className="size-3.5" aria-hidden="true" />
        </span>
      </span>
      <span className="sr-only" role="status">
        {copied ? label : ''}
      </span>
    </Button>
  );
}
