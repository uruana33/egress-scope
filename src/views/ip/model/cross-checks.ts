import { t } from '@/i18n';
import { coffeeHref } from '@/views/ip/model/cross-intel';

export type CatalogSourceId =
  | 'coffee'
  | 'ipinfo'
  | 'ip2location'
  | 'ipapi'
  | 'ipqs'
  | 'scamalytics'
  | 'abuseipdb'
  | 'ippure'
  | 'proxycheck'
  | 'dnsbl'
  | 'torexit'
  | 'ipregistry';

export interface SourceDef {
  id: CatalogSourceId;
  name: string;
  /**
   * Worker tries to read the source. auto:false sources stay links unless
   * the worker produced readings anyway (e.g. a deployer-configured API key).
   */
  auto: boolean;
  /** Sources without geolocation data are skipped in the place table. */
  geo?: boolean;
  metric: string;
  why: string;
  href: string;
}

/**
 * The exam table: network + reputation sources a reader should actually open.
 * Coffee is the JSON dossier we already fetched; the rest are either parsed
 * public pages or a deep link to the field the reader should verify by hand.
 */
export function sourceCatalog(ip: string): SourceDef[] {
  const q = encodeURIComponent(ip);
  return [
    {
      id: 'coffee',
      name: 'Net.Coffee',
      auto: true,
      metric: t('信誉与用途'),
      why: t('家宽/机房旗标、VPN/代理、滥用与注册国'),
      href: coffeeHref(ip),
    },
    {
      id: 'ipinfo',
      name: 'IPinfo',
      auto: true,
      metric: t('隐私检测'),
      why: t('ASN 类型、VPN / 中继 / 住宅代理'),
      href: `https://ipinfo.io/${q}`,
    },
    {
      id: 'ip2location',
      name: 'IP2Location',
      auto: true,
      metric: t('代理类型'),
      why: t('用途类型与代理库（含供应商）'),
      href: `https://www.ip2location.io/${q}`,
    },
    {
      id: 'ipapi',
      name: 'IP-API',
      auto: true,
      metric: t('代理 / 机房'),
      why: t('proxy 是 VPN/代理/Tor 合一旗标，不能单独当成已确认 VPN'),
      href: `https://ip-api.com/#${q}`,
    },
    {
      id: 'ipqs',
      name: 'IPQualityScore',
      auto: false,
      metric: t('欺诈分'),
      why: t('≥75 常为代理，不等于已确认欺诈'),
      href: `https://www.ipqualityscore.com/free-ip-lookup-proxy-vpn-test/lookup/${q}`,
    },
    {
      id: 'scamalytics',
      name: 'Scamalytics',
      auto: true,
      metric: t('欺诈分'),
      why: t('该 IP 上用户与欺诈相关的比例'),
      href: `https://scamalytics.com/ip/${q}`,
    },
    {
      id: 'abuseipdb',
      name: 'AbuseIPDB',
      auto: false,
      metric: t('滥用置信度'),
      why: t('举报历史，不是住宅/VPN 判定'),
      href: `https://www.abuseipdb.com/check/${q}`,
    },
    {
      id: 'ippure',
      name: 'IPPure',
      auto: true,
      metric: t('纯净度'),
      why: t('蜜罐风险分，不是访客指纹'),
      href: `https://ippure.com/?ip=${q}`,
    },
    {
      id: 'proxycheck',
      name: 'proxycheck.io',
      auto: true,
      metric: t('代理 / VPN / Tor'),
      why: t('proxy、VPN、Tor 分开判定；风险分 0–100 越高越危险'),
      href: `https://proxycheck.io/v3/${q}`,
    },
    {
      id: 'dnsbl',
      name: 'DNSBL 黑名单',
      auto: true,
      geo: false,
      metric: t('滥用黑名单'),
      why: t('30 个公开滥用名单的实时列入记录，只覆盖 IPv4'),
      href: `https://mxtoolbox.com/SuperTool.aspx?action=blacklist%3a${q}&run=toolpage`,
    },
    {
      id: 'torexit',
      name: 'Tor 出口名单',
      auto: true,
      geo: false,
      metric: t('官方出口名单'),
      why: t('Tor 项目公布的当前出口地址，只覆盖 IPv4'),
      href: 'https://check.torproject.org/torbulkexitlist',
    },
    {
      id: 'ipregistry',
      name: 'IPregistry',
      auto: true,
      metric: t('安全旗标'),
      why: t('abuser / attacker / threat 旗标与连接类型'),
      href: `https://ipregistry.co/${q}`,
    },
  ];
}

/** Outbound checks only — the JSON dossier is rendered from Coffee itself. */
export function crossChecks(ip: string) {
  return sourceCatalog(ip).filter((item) => item.id !== 'coffee');
}
