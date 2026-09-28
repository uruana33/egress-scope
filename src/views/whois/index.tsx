import { useEffect } from 'react';

import { useQuery } from '@tanstack/react-query';

import { ErrorNotice, Pending } from '@/components/toolkit';
import { useLookupHistory } from '@/hooks/use-lookup-history';
import { locale, t } from '@/i18n';
import { SnapshotNotice } from '@/views/ip/components/snapshot-notice';
import type { FolioCardItem } from '@/views/lookup/folio-cards';
import { FolioCards } from '@/views/lookup/folio-cards';

import type { Registration } from './api';
import { lookupWhois } from './api';

export const WHOIS_HISTORY_KEY = 'egress-scope:whois-history:v1';

const EVENT_LABELS: Record<string, string> = {
  registration: '注册',
  registered: '注册',
  expiration: '到期',
  'expiration date': '到期',
  'last changed': '最后更新',
  'last update of rdap database': 'RDAP 数据库最后更新',
  transfer: '转移',
  reinstatement: '恢复',
};

const STATUS_LABELS: Record<string, string> = {
  active: '活跃',
  inactive: '未激活',
  pending: '处理中',
  'pending create': '等待创建',
  'pending renew': '等待续期',
  'pending transfer': '等待转移',
  'pending update': '等待更新',
  'pending delete': '等待删除',
  'client transfer prohibited': '客户端禁止转移',
  'server transfer prohibited': '注册局禁止转移',
  'client update prohibited': '客户端禁止更新',
  'server update prohibited': '注册局禁止更新',
  'client delete prohibited': '客户端禁止删除',
  'server delete prohibited': '注册局禁止删除',
  'client hold': '客户端暂停解析',
  'server hold': '注册局暂停解析',
};

const ROLE_LABELS: Record<string, string> = {
  registrant: '注册人',
  administrative: '管理联系人',
  technical: '技术联系人',
  billing: '账务联系人',
  registrar: '注册商',
  reseller: '经销商',
  abuse: '滥用联系人',
  noc: '网络运维联系人',
};

const OBJECT_CLASS_LABELS: Record<string, string> = {
  domain: '域名',
  'ip network': 'IP 网络',
  autnum: '自治系统号',
  entity: '注册实体',
  nameserver: '名称服务器',
};

function rdapLabel(value: string | undefined, labels: Record<string, string>) {
  if (!value) return undefined;
  const key = value
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[_-]+/g, ' ');
  const mapped = labels[key];
  return mapped ? t(mapped) : value;
}

function vcardText(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (Array.isArray(value)) {
    const text = value
      .flatMap((item) => (Array.isArray(item) ? item : [item]))
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
      .join(' ');
    return text || undefined;
  }
  return undefined;
}

function entityName(entity: NonNullable<Registration['data']['entities']>[number]) {
  const fields = entity.vcardArray?.[1];
  if (!Array.isArray(fields)) return undefined;
  for (const field of fields) {
    if (!Array.isArray(field) || typeof field[0] !== 'string') continue;
    const key = field[0].toLowerCase();
    if (key !== 'fn' && key !== 'org') continue;
    const value = vcardText(field[3]);
    if (value) return value;
  }
  return undefined;
}

function whoisCards(data: Registration['data'], source?: string): FolioCardItem[] {
  const items: FolioCardItem[] = [];
  const add = (label: string, value?: string, extra?: Partial<FolioCardItem>) => {
    const text = value?.trim();
    if (!text || text === t('未知')) return;
    items.push({ label, value: text, ...extra });
  };

  add(t('查询协议'), source?.startsWith('RDAP') ? t('注册信息（RDAP）') : source);
  add(t('对象类型'), rdapLabel(data.objectClassName, OBJECT_CLASS_LABELS));
  add(t('标识符'), data.handle);
  add(t('国家 / 地区'), data.country);
  if (data.startAddress) {
    add(t('地址范围'), `${data.startAddress} – ${data.endAddress ?? data.startAddress}`);
  }
  for (const event of data.events ?? []) {
    add(
      rdapLabel(event.eventAction, EVENT_LABELS) ?? event.eventAction,
      new Date(event.eventDate).toLocaleString(locale)
    );
  }
  if (data.status?.length) {
    const status = data.status.map((item) => rdapLabel(item, STATUS_LABELS)).join(' · ');
    add(t('域名状态'), status, { wide: status.length > 28 });
  }
  const nameservers = (data.nameservers ?? [])
    .map((server) => server.ldhName)
    .filter((name): name is string => !!name);
  if (nameservers.length) {
    add(t('DNS 服务器'), nameservers.join(' · '), { wide: true });
  }
  data.entities?.forEach((entity, index) => {
    const roles = (entity.roles ?? []).map((role) => rdapLabel(role, ROLE_LABELS));
    items.push({
      key: `entity-${entity.handle ?? index}`,
      label: roles.filter((role): role is string => !!role).join(' / ') || t('注册实体'),
      value: entityName(entity) ?? entity.handle ?? t('隐私保护'),
    });
  });
  return items;
}

export default function WhoisPanel({
  query,
  embedded = false,
}: {
  query: string;
  compact?: boolean;
  embedded?: boolean;
  plain?: boolean;
}) {
  const history = useLookupHistory<Registration>(WHOIS_HISTORY_KEY);
  const cached = history.find(query);
  const lookup = useQuery({
    queryKey: ['whois', query],
    enabled: !!query,
    placeholderData: cached?.data,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: async ({ signal }) => {
      return lookupWhois(query, signal);
    },
    retry: false,
  });
  useEffect(() => {
    if (lookup.data && !lookup.isPlaceholderData && !lookup.error && !lookup.isFetching)
      history.save(query, lookup.data);
    // `save` is stable per key; re-running on identity would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookup.data, lookup.isPlaceholderData, lookup.error, lookup.isFetching, query]);
  const result = lookup.data ?? cached?.data;
  const data = result?.data;
  const isSnapshot = !!cached && (!lookup.data || lookup.isPlaceholderData);
  const showingSnapshot = isSnapshot && lookup.isFetching;
  const refreshFailed = !!lookup.error && !!data && !lookup.isFetching;
  const fetchedAt = !isSnapshot && lookup.dataUpdatedAt ? lookup.dataUpdatedAt : cached?.savedAt;
  const items = data ? whoisCards(data, result?.source) : [];

  return (
    <div className={embedded ? 'whois-embedded' : 'space-y-3'}>
      <ErrorNotice error={lookup.error} />
      {showingSnapshot ? <SnapshotNotice savedAt={cached?.savedAt} /> : null}
      {fetchedAt ? (
        <p className="status-line">
          {isSnapshot || refreshFailed ? t('上次读取于') : t('读取于')}{' '}
          {new Date(fetchedAt).toLocaleString(locale)}
        </p>
      ) : null}
      {refreshFailed ? (
        <p className="status-line" role="status">
          {t('查询失败')}，{t('仍显示上次成功结果。')}
        </p>
      ) : null}
      {lookup.isFetching && (
        <p className="status-line">
          <Pending>{t('正在向注册局查询…')}</Pending>
        </p>
      )}
      {data ? (
        <div className="lookup-results">
          {embedded ? null : (
            <h3 className="whois-result-name">{data.ldhName ?? data.name ?? query}</h3>
          )}
          <FolioCards items={items} />
          <details className="raw-details">
            <summary>{t('查看原始 RDAP 数据')}</summary>
            <pre>{JSON.stringify(data, null, 2)}</pre>
          </details>
        </div>
      ) : null}
    </div>
  );
}
