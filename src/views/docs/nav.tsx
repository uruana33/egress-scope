import { Link } from 'react-router-dom';

import { t } from '@/i18n';

const DOC_LINKS = [
  { to: '/docs/egress-ip', label: t('出口 IP 检测') },
  { to: '/docs/dns-leak', label: t('DNS 泄露') },
  { to: '/docs/clash', label: t('Clash 健康检查') },
  { to: '/docs/health', label: t('健康检查 API') },
] as const;

export function DocsNav({ current }: { current: string }) {
  return (
    <nav className="docs-nav" aria-label={t('文档')}>
      {DOC_LINKS.map((item) => (
        <Link key={item.to} to={item.to} aria-current={item.to === current ? 'page' : undefined}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
