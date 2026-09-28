import { type ReactNode, useEffect, useRef } from 'react';

export function FolioFold({
  id,
  title,
  hint,
  open,
  children,
}: {
  id?: string;
  title: string;
  hint?: string;
  open?: boolean;
  children: ReactNode;
}) {
  const node = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (open && node.current) node.current.open = true;
  }, [open]);

  return (
    <details id={id} ref={node} className="ip-folio-fold">
      <summary>
        <span className="ip-folio-fold-title">{title}</span>
        {hint ? <span className="ip-folio-fold-hint">{hint}</span> : null}
      </summary>
      <div className="ip-folio-fold-body">{children}</div>
    </details>
  );
}
