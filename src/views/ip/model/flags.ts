import { t } from '@/i18n';

import type { CoffeeIp } from '../coffee';

/** The anonymity checks IPQS and Scamalytics lead with, from Coffee flags. */
export function proxyFlags(d: CoffeeIp) {
  return [
    {
      id: 'vpn',
      label: 'VPN',
      hit: d.is_vpn === true,
      known: typeof d.is_vpn === 'boolean',
    },
    {
      id: 'proxy',
      label: t('代理'),
      hit: d.is_proxy === true,
      known: typeof d.is_proxy === 'boolean',
    },
    {
      id: 'tor',
      label: 'Tor',
      hit: d.is_tor === true,
      known: typeof d.is_tor === 'boolean',
    },
    {
      id: 'crawler',
      label: t('爬虫'),
      hit: d.is_crawler === true,
      known: typeof d.is_crawler === 'boolean',
    },
    {
      id: 'abuse',
      label: t('滥用'),
      hit: d.is_abuser === true,
      known: typeof d.is_abuser === 'boolean',
    },
  ];
}
