import { Link } from 'react-router-dom';

import { Activity, ArrowRightFromLine, Home, Search, Sparkles } from 'lucide-react';

import { LanguageSelect } from '@/components/language-select';
import { SiteBrand } from '@/components/site-brand';
import { ThemeSelect } from '@/components/theme/theme-select';
import { t } from '@/i18n';

import { navigationRoutes } from './routes';

const ROUTE_ICONS = {
  '/': Home,
  '/network/ip': Search,
  '/ai/': Sparkles,
  '/status/': Activity,
  '/network/egress': ArrowRightFromLine,
} as const;

export const navigationOptions = navigationRoutes.map((route) => {
  const Icon = ROUTE_ICONS[route.value as keyof typeof ROUTE_ICONS];
  return {
    value: route.value,
    label: (
      <>
        <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
        <span className="nav-full">{route.label}</span>
        <span className="nav-short">{route.short}</span>
      </>
    ),
  };
});

const FOOTER_LINKS: { to: string; label: string }[] = [
  { to: '/docs/health', label: 'API' },
  { to: '/docs/egress-ip', label: t('出口 IP 检测') },
  { to: '/docs/dns-leak', label: t('DNS 泄露') },
  { to: '/docs/clash', label: t('Clash 健康检查') },
  { to: '/share', label: t('分享报告') },
  { to: '/terms', label: t('使用条款') },
  { to: '/privacy', label: t('隐私政策') },
];

export function SiteFooter() {
  return (
    <footer className="app-footer">
      <div className="app-footer-brand">
        <SiteBrand />
        <span className="app-footer-copy">© {new Date().getFullYear()}</span>
        <span className="app-footer-tagline">
          {t('面向代理与分流用户的出口诊断工作台 · 不提供纯净度排名')}
        </span>
      </div>
      <nav className="app-footer-nav" aria-label={t('站点链接')}>
        {FOOTER_LINKS.map((link) => (
          <Link className="app-footer-link" to={link.to} key={link.to}>
            {link.label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}

export function MobileHeader() {
  return (
    <header className="mobile-site-header">
      <SiteBrand />
      <div className="flex items-center gap-1">
        <LanguageSelect />
        <ThemeSelect className="size-8 rounded-full text-muted-foreground hover:bg-accent/50" />
      </div>
    </header>
  );
}
