import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { t } from '@/i18n';
import { lookupHref } from '@/views/lookup/href';

import type { AiPlatform } from './platforms';

export function AiPlatformLinks({ platform }: { platform: AiPlatform }) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {[
        { name: t('官网'), url: `https://${platform.domain}` },
        platform.apiUrl
          ? {
              name: platform.id === 'qwen' ? t('API 地址（美国）') : t('API 地址'),
              url: platform.apiUrl,
            }
          : null,
        platform.docsUrl
          ? { name: platform.docsLabel ?? t('API 文档'), url: platform.docsUrl }
          : null,
      ]
        .filter((link) => link != null)
        .map((link) => (
          <Button variant="outline" size="sm" asChild key={link.name}>
            <a href={link.url} target="_blank" rel="noreferrer">
              {link.name} ↗
            </a>
          </Button>
        ))}
      {platform.statusId && (
        <Button variant="outline" size="sm" asChild>
          <Link to={`/status?service=${platform.statusId}`}>{t('服务状态')}</Link>
        </Button>
      )}
      {platform.statusPage && (
        <Button variant="outline" size="sm" asChild>
          <a
            href={platform.statusPage}
            target="_blank"
            rel="noreferrer"
            title={platform.statusLabel ?? t('官方状态 ↗')}>
            {platform.statusLabel ?? t('官方状态')} ↗
          </a>
        </Button>
      )}
      <Button variant="outline" size="sm" asChild>
        <Link to="/network/ip">{t('查询公网 IP')}</Link>
      </Button>
      <Button variant="outline" size="sm" asChild>
        <Link to="/network/egress?tab=dns">{t('DNS 出口')}</Link>
      </Button>
      <Button variant="outline" size="sm" asChild>
        <Link to={lookupHref(platform.domain, 'ping')}>{t('各地快不快')}</Link>
      </Button>
      {['gpt', 'claude'].includes(platform.id) && (
        <Button variant="outline" size="sm" asChild>
          <a
            href={
              platform.id === 'claude'
                ? 'https://www.anthropic.com/supported-countries'
                : 'https://platform.openai.com/docs/supported-countries'
            }
            target="_blank"
            rel="noreferrer">
            {t('支持地区 ↗')}
          </a>
        </Button>
      )}
    </div>
  );
}
