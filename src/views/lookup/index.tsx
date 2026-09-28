import { useEffect } from 'react';

import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { useQueryClient } from '@tanstack/react-query';
import { FileText, Gauge, MapPin } from 'lucide-react';

import { LookupForm } from '@/components/lookup-form';
import { ErrorNotice } from '@/components/toolkit';
import { useLookupHistory } from '@/hooks/use-lookup-history';
import { t } from '@/i18n';
import { queryKeys } from '@/lib/query-keys';
import IpPanel from '@/views/ip';
import { IP_LOOKUP_HISTORY_KEY } from '@/views/ip/hooks/use-ip-lookup';
import { WHOIS_HISTORY_KEY } from '@/views/whois';

import { LOOKUP_EXAMPLES, classifyLookup } from './classify.ts';
import { type LookupView, lookupLocation } from './href.ts';
import { DomainResult } from './result-frame';

function readView(value: string | null): LookupView | undefined {
  return value === 'whois' || value === 'ping' ? value : undefined;
}

const EXAMPLE_KIND: Record<(typeof LOOKUP_EXAMPLES)[number], string> = {
  '1.1.1.1': 'IP',
  'qq.com': '网站',
};

function RecentLookups({ onPick }: { onPick: (query: string) => void }) {
  const ip = useLookupHistory(IP_LOOKUP_HISTORY_KEY);
  const whois = useLookupHistory(WHOIS_HISTORY_KEY);
  const seen = new Set<string>();
  const items = [...ip.entries, ...whois.entries]
    .sort((left, right) => right.savedAt - left.savedAt)
    .filter((entry) => {
      const kind = classifyLookup(entry.query).kind;
      if (kind !== 'ip' && kind !== 'domain') return false;
      const key = entry.query.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
  if (!items.length) return null;
  return (
    <div className="ip-recent">
      <span>{t('最近查询')}</span>
      {items.map((item) => (
        <button key={item.query} type="button" onClick={() => onPick(item.query)}>
          {item.query}
        </button>
      ))}
    </div>
  );
}

export default function LookupPage() {
  const { ip: pathValue } = useParams();
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const raw = pathValue ?? params.get('q') ?? params.get('host') ?? '';
  const classified = classifyLookup(raw);
  const view = readView(params.get('view'));
  const hasQuery = !!classified.value || !!raw.trim();

  useEffect(() => {
    if (view === 'whois') {
      document.title = t('WHOIS／RDAP 查询 · 出口观测台');
      return;
    }
    if (view === 'ping') {
      document.title = t('全球延迟抽样 · 出口观测台');
      return;
    }
    document.title = classified.value
      ? t('{0} 的质量分与归属 · 出口观测台', [classified.value])
      : t('IP 质量与归属查询 · 出口观测台');
  }, [classified.value, view]);

  useEffect(() => {
    if (!pathValue) return;
    if (classified.kind === 'ip' || classified.kind === 'unknown') return;
    navigate(lookupLocation(classified.value, view), { replace: true });
  }, [pathValue, classified.kind, classified.value, view, navigate]);

  useEffect(() => {
    if (!view || !classified.value) return;
    const id = `lookup-${view}`;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({
        behavior: reduce ? 'auto' : 'smooth',
        block: 'start',
      });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [view, classified.value]);

  const submit = (value: string) => {
    const next = lookupLocation(value);
    if (next.pathname === pathname && next.search === params.toString()) {
      if (classified.kind === 'ip')
        void client.invalidateQueries({
          queryKey: queryKeys.ip.classification(classified.value),
        });
      void client.invalidateQueries({ queryKey: ['whois', classified.value] });
      return;
    }
    navigate(next);
  };

  const unknown = !!raw.trim() && classified.kind === 'unknown';
  const form = (
    <LookupForm
      grouped
      tone="display"
      value={classified.value || raw}
      placeholder={t('输入 IP 或网站')}
      label={t('查看质量分')}
      busy={false}
      onSubmit={submit}
    />
  );

  const hints = (
    <>
      {classified.strippedUrl ? (
        <p className="small muted ip-folio-hint">
          {t('已去掉网址里的 https:// 和路径，按 {0} 查询。', [classified.value])}
        </p>
      ) : null}
      {classified.subdomainHint ? (
        <p className="small muted ip-folio-hint">
          {t('子域名可能没有独立注册记录，通常应查询注册用的主域名。')}
        </p>
      ) : null}
    </>
  );

  return (
    <div className="lookup-page space-y-3">
      {hasQuery ? (
        <>
          {unknown ? (
            <article className="ip-folio">
              <header className="ip-folio-mast">
                <h1 className="sr-only">{t('IP 质量')}</h1>
                <div className="ip-folio-query">
                  <div className="ip-folio-query-field">{form}</div>
                </div>
                {hints}
                <ErrorNotice error={new Error(t('请输入 IP 地址或网站域名。'))} />
              </header>
            </article>
          ) : null}
          {classified.kind === 'ip' ? (
            <>
              {hints}
              <IpPanel ip={classified.value} view={view} search={form} />
            </>
          ) : null}
          {classified.kind === 'domain' ? (
            <>
              {hints}
              <DomainResult query={classified.value} view={view} search={form} />
            </>
          ) : null}
        </>
      ) : (
        <article className="ip-folio ip-folio-idle">
          <header className="ip-folio-mast">
            <h1 className="sr-only">{t('IP 质量')}</h1>
            <div className="ip-folio-query">
              <div className="ip-folio-query-field">{form}</div>
            </div>
            <div className="ip-folio-chips">
              <div className="ip-folio-examples">
                <span>{t('试试')}</span>
                {LOOKUP_EXAMPLES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className="ip-folio-example"
                    aria-label={`${t(EXAMPLE_KIND[value])} ${value}`}
                    onClick={() => submit(value)}>
                    <span className="ip-folio-example-kind">{t(EXAMPLE_KIND[value])}</span>
                    {value}
                  </button>
                ))}
              </div>
              <RecentLookups onPick={submit} />
            </div>
            <div className="ip-folio-idle-features" aria-hidden="true">
              <span>
                <MapPin className="size-3.5" />
                {t('位置归属')}
              </span>
              <span>
                <FileText className="size-3.5" />
                {t('注册信息')}
              </span>
              <span>
                <Gauge className="size-3.5" />
                {t('各地延迟')}
              </span>
            </div>
          </header>
        </article>
      )}
    </div>
  );
}
