import { t } from '@/i18n';
import type { FolioCardItem, FolioTone } from '@/views/lookup/folio-cards';
import { FolioCards } from '@/views/lookup/folio-cards';

import type { CoffeeIp } from '../coffee';
import { number, rpkiLabel } from './cells';

function present(value?: string) {
  const text = value?.trim();
  return text && text !== '—' ? text : undefined;
}

function detected(label: string, hit: FolioTone = 'bad'): FolioCardItem {
  return {
    label,
    value: t('已检测到'),
    tone: hit,
  };
}

/** Extra network and risk facts as a card spread — not a second copy of the sheet. */
export function ExtraCards({ d }: { d: CoffeeIp }) {
  const items: FolioCardItem[] = [];
  const push = (item?: FolioCardItem) => {
    if (item) items.push(item);
  };

  const org = present(d.asOrganization);
  if (org && org !== d.asname && org !== d.isp) {
    push({ label: t('ASN 组织'), value: org });
  }

  const facility = present(d.datacenter_name);
  const company = present(d.company_name);
  if (facility) push({ label: t('机房名称'), value: facility });
  else if (company) push({ label: t('企业信息'), value: company });
  if (company && facility && company !== facility) {
    push({ label: t('企业信息'), value: company });
  }

  if (d.range?.first && d.range?.last) {
    push({
      label: t('IP 范围'),
      value: `${d.range.first} – ${d.range.last}`,
    });
  }
  if (typeof d.range?.count === 'number') {
    push({ label: t('地址数量'), value: number(d.range.count) });
  }
  push(present(d.asn_tbps) ? { label: t('预估带宽'), value: d.asn_tbps } : undefined);
  if (typeof d.asn_ipv4_count === 'number') {
    push({ label: t('ASN IPv4 总量'), value: number(d.asn_ipv4_count) });
  }
  push(present(d.asn_allocated) ? { label: t('ASN 注册日期'), value: d.asn_allocated } : undefined);
  push(present(d.rdns) ? { label: 'PTR', value: d.rdns } : undefined);

  if (present(d.rpki_status)) {
    const status = d.rpki_status!.toLowerCase();
    push({
      label: 'RPKI',
      value: rpkiLabel(d.rpki_status),
      tone: status === 'valid' ? 'good' : status === 'invalid' ? 'bad' : 'neutral',
    });
  }

  if (d.is_bogon === true) push(detected('Bogon'));
  if (d.reddit_blocked === true) push(detected(t('Reddit 限制'), 'warn'));

  const threats = d.intelligence?.threats;
  if (Array.isArray(threats)) {
    push({
      label: t('风险标记'),
      value: threats.length ? threats.join(' · ') : t('未发现明显威胁'),
      tone: threats.length ? 'bad' : 'good',
    });
  }

  const verdict = present(d.ai_verdict?.label);
  if (verdict) {
    const confidence =
      d.ai_verdict?.confidence == null ? undefined : `${Math.round(d.ai_verdict.confidence)}%`;
    const why = present(d.ai_verdict?.reasoning);
    push({
      label: t('访问评估'),
      value: verdict,
      hint: [confidence, why].filter(Boolean).join(' · '),
      wide: !!why,
    });
  }

  if (d.related_domains?.length) {
    push({
      label: t('关联域名'),
      value: d.related_domains.map((item) => item.domain).join(' · '),
      wide: true,
    });
  }

  return <FolioCards items={items} />;
}
