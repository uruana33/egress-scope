import { ArrowRight } from 'lucide-react';

import { ToolCard } from '@/components/toolkit';
import { Button } from '@/components/ui/button';
import { t } from '@/i18n';

import type { CoffeeLookup } from '../coffee';
import { IpFacts } from '../field-help';
import { chip, riskFlag } from './cells';

/**
 * The first tab answers the follow-up questions the verdict strip raises:
 * whose network is this, how risky does it look, and do the sources agree on
 * where it is. Full field lists stay on their own tabs.
 */
export function OverviewPanel({
  data,
  onShowLocation,
}: {
  data: CoffeeLookup;
  onShowLocation: () => void;
}) {
  const d = data.coffee;
  const countries = new Set(data.sources.map((source) => source.country).filter(Boolean));
  const split = countries.size > 1;
  const consensus =
    [d.country, d.region, d.city]
      .filter(Boolean)
      .filter((v, i, all) => all.indexOf(v) === i)
      .join(' · ') || undefined;

  return (
    <div className="ip-dossier-grid">
      <ToolCard title={t('网络归属')}>
        <IpFacts
          rows={[
            ['ASN', d.asn ? `AS${d.asn}` : undefined],
            [t('服务商'), d.isp],
            [t('ASN 归属'), d.asname],
            ['CIDR', d.cidr],
            [t('地址类型'), d.ip.includes(':') ? 'IPv6' : 'IPv4'],
            [t('注册国家'), d.registered_country],
          ]}
        />
      </ToolCard>
      <ToolCard title={t('风险信号')}>
        <IpFacts
          rows={[
            ['VPN', riskFlag(d.is_vpn)],
            [t('代理'), riskFlag(d.is_proxy)],
            ['Tor', riskFlag(d.is_tor)],
            [t('滥用标记'), riskFlag(d.is_abuser)],
            [t('滥用评分'), d.intelligence?.abuser_score_raw ?? d.abuser_score],
          ]}
        />
      </ToolCard>
      <ToolCard title={t('位置共识')}>
        <IpFacts
          rows={[
            [
              t('共识位置'),
              consensus ? <span className="ip-fact-wrap">{consensus}</span> : undefined,
            ],
            [t('数据来源'), data.sources.length || undefined],
            [
              t('一致性'),
              data.sources.length
                ? split
                  ? chip(t('存在分歧'), 'warn')
                  : chip(t('各源一致'), 'good')
                : chip(t('未知')),
            ],
          ]}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-1 self-start text-xs text-primary"
          onClick={onShowLocation}>
          {t('查看多源对比')}
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </Button>
      </ToolCard>
    </div>
  );
}
