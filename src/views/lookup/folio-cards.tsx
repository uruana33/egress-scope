import type { ReactNode } from 'react';

export type FolioTone = 'good' | 'warn' | 'bad' | 'neutral';

export interface FolioCardItem {
  key?: string;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: FolioTone;
  wide?: boolean;
}

export function FolioPack({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="ip-folio-pack">
      {title ? <p className="ip-folio-kicker">{title}</p> : null}
      {children}
    </section>
  );
}

export function FolioCards({ items }: { items: FolioCardItem[] }) {
  if (!items.length) return null;
  return (
    <ul className="ip-folio-cards" data-count={items.length}>
      {items.map((item, index) => (
        <FolioCard
          key={item.key ?? `${item.label}:${index}`}
          label={item.label}
          value={item.value}
          hint={item.hint}
          tone={item.tone}
          wide={item.wide}
        />
      ))}
    </ul>
  );
}

export function FolioCard({ label, value, hint, tone, wide }: Omit<FolioCardItem, 'key'>) {
  return (
    <li
      className="ip-folio-card"
      data-tone={tone && tone !== 'neutral' ? tone : undefined}
      data-wide={wide || undefined}>
      <span className="ip-folio-card-label">{label}</span>
      <span className="ip-folio-card-value">{value}</span>
      {hint ? <span className="ip-folio-card-hint">{hint}</span> : null}
    </li>
  );
}
