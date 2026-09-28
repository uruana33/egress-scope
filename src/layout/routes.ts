import { t } from '@/i18n';
import { aiPlatforms } from '@/views/ai/platforms';

export const navigationRoutes = [
  { value: '/', label: t('概览'), short: t('概览') },
  { value: '/network/ip', label: t('IP 质量'), short: t('质量') },
  { value: '/ai/', label: t('AI 出口'), short: 'AI' },
  { value: '/status/', label: t('服务状态'), short: t('状态') },
  { value: '/network/egress', label: t('分流出口'), short: t('出口') },
] as const;
export const toolGroups = {
  network: [{ path: '/network/egress', label: t('分流出口') }],
  ai: aiPlatforms.map((platform) => ({
    path: `/ai/${platform.id}`,
    label: platform.name,
  })),
} as const;
export const legacyRoutes: Record<string, string> = {
  '/query': '/network/ip',
  '/query/ip': '/network/ip',
  '/query/ip/:ip': '/network/ip',
  '/query/whois': '/network/whois',
  '/ip': '/network/ip',
  '/ip/:ip': '/network/ip',
  '/whois': '/network/whois',
  '/link': '/network/ip',
  '/network/link': '/network/ip',
  '/network/subdomains': '/network/ip',
  '/ping': '/network/ping',
  '/cdn': '/network/egress',
  '/dns-exit': '/network/egress',
  '/network/dns-exit': '/network/egress',
  '/network/webrtc': '/webrtc',
  '/gpt': '/ai/gpt',
  '/claude': '/ai/claude',
  '/gpt/status.html': '/status/openai',
  '/claude/status.html': '/status/claude',
  '/ai/gpt/status': '/status/openai',
  '/ai/claude/status': '/status/claude',
};
export function activeNavigationRoute(pathname: string) {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/' || path === '/webrtc') return '/';
  const landing: Record<string, string> = {
    network: '/network/egress',
    ai: '/ai/',
  };
  if (
    path === '/network/ip' ||
    /^\/network\/ip\/[^/]+$/.test(path) ||
    path === '/network/whois' ||
    path === '/network/ping' ||
    path === '/network/connectivity'
  )
    return '/network/ip';
  if (path === '/network/subdomains') return '/network/ip';
  for (const [group, routes] of Object.entries(toolGroups)) {
    if (path === `/${group}` || routes.some((route) => route.path === path))
      return landing[group] ?? `/${group}/`;
  }
  return /^\/status(?:\/(?:openai|claude))?$/.test(path) ? '/status/' : 'not-found';
}
