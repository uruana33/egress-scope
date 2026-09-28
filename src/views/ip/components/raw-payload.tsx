import { useState } from 'react';

import { ChevronDown } from 'lucide-react';

import { CopyButton } from '@/components/copy-button';
import { t } from '@/i18n';

/**
 * The full upstream payload, kept out of the way but reachable. The page shows
 * a curated subset, and until now anything it did not render was simply lost to
 * the reader — including fields added by the source after this page was built.
 */
export function RawPayload({ data }: { data: unknown }) {
  const [open, setOpen] = useState(false);
  // Serialising a large object on every render is wasted work while collapsed.
  const text = open ? JSON.stringify(data, null, 2) : '';
  return (
    <details className="ip-raw" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="ip-raw-summary">
        <ChevronDown aria-hidden="true" className="size-4" />
        <span>{t('原始数据（JSON）')}</span>
      </summary>
      {open ? (
        <div className="ip-raw-body">
          <div className="ip-raw-actions">
            <CopyButton value={text} />
          </div>
          <pre className="ip-raw-code">
            <code>{text}</code>
          </pre>
        </div>
      ) : null}
    </details>
  );
}
