import { type ReactNode, useEffect } from 'react';

import './docs-health.css';
import { DocsNav } from './nav';

export function DocArticle({
  path,
  title,
  description,
  heading,
  children,
}: {
  path: string;
  title: string;
  description: string;
  heading: string;
  children: ReactNode;
}) {
  useEffect(() => {
    document.title = title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', description);
  }, [title, description]);
  return (
    <div className="docs-health space-y-3">
      <DocsNav current={path} />
      <header className="page-header">
        <div className="page-header-text">
          <h1>{heading}</h1>
          <p>{description}</p>
        </div>
      </header>
      {children}
    </div>
  );
}
