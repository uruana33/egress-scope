import { FileText, MapPin, Radio } from 'lucide-react';

import { t } from '@/i18n';

const items = [
  {
    icon: MapPin,
    label: () => t('位置'),
    title: () => t('这是谁、在哪'),
    text: () => t('位置、运营商、是不是机房或代理。输入 IP 后显示。'),
  },
  {
    icon: FileText,
    label: () => t('注册'),
    title: () => t('谁注册的'),
    text: () => t('域名有没有到期、网段归谁管。域名和 IP 都可以查。'),
  },
  {
    icon: Radio,
    label: () => t('延迟'),
    title: () => t('各地快不快'),
    text: () => t('从世界各地测延迟。不会自动开始，需要时再点一下。'),
  },
] as const;

/** What the one search box returns — legend, not three competing tools. */
export function LookupGuide() {
  return (
    <section className="ip-folio-lede" aria-label={t('能查到什么')}>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.title()}>
            <span className="ip-folio-lede-label">
              <Icon className="ip-folio-lede-icon" aria-hidden="true" />
              {item.label()}
            </span>
            <strong>{item.title()}</strong>
            <span className="ip-folio-lede-hint">{item.text()}</span>
          </div>
        );
      })}
    </section>
  );
}
