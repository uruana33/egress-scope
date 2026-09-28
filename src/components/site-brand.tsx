import { useId } from 'react';

import { Link } from 'react-router-dom';

import { t } from '@/i18n';
import { cn } from '@/lib/utils';

/**
 * Brand tile: a gradient badge holding the product's signature motif —
 * one source node fanning out into two probe echoes (domestic / overseas),
 * the same split-egress diagram the home page is built around.
 */
export function BrandMark({ className }: { className?: string }) {
  const gradientId = `brand-grad-${useId().replace(/:/g, '')}`;
  return (
    <svg
      viewBox="0 0 28 28"
      className={cn('site-brand-mark', className)}
      aria-hidden="true"
      focusable="false">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#0ea5e9" />
        </linearGradient>
        <linearGradient id={`${gradientId}-sheen`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.18" />
          <stop offset="48%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="28" height="28" rx="8" fill={`url(#${gradientId})`} />
      <rect width="28" height="28" rx="8" fill={`url(#${gradientId}-sheen)`} />
      <g fill="none" stroke="#fff" strokeWidth="1.85" strokeLinecap="round" opacity="0.92">
        <path d="M 7.4 14 C 11.8 14, 11.8 8.3, 16.6 8.3" />
        <path d="M 7.4 14 C 11.8 14, 11.8 19.7, 16.6 19.7" />
      </g>
      <circle cx="6.3" cy="14" r="2.2" fill="#fff" />
      <circle cx="20.7" cy="8.3" r="2.2" fill="#fff" />
      <circle cx="20.7" cy="19.7" r="2.2" fill="#bae6fd" />
    </svg>
  );
}

export function SiteBrand({ className }: { className?: string }) {
  return (
    <Link to="/" className={cn('site-brand', className)} aria-label={t('出口观测台')}>
      <BrandMark />
      <span className="site-brand-name" aria-hidden="true">
        <b className="site-brand-name-ip">{t('出口')}</b>
        {t('观测台')}
      </span>
    </Link>
  );
}
