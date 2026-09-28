import type { UseQueryResult } from '@tanstack/react-query';

import { CountryFlag } from '@/components/country-flag';
import { Facts, IpText, Pending, PrivacyToggle, ToolCard } from '@/components/toolkit';
import { Button } from '@/components/ui/button';
import { locale, t } from '@/i18n';

interface ExitData {
  ip?: string;
  country_code?: string;
}

interface GeoData {
  country?: string;
  country_code?: string;
  city?: string;
  isp?: string;
  asn?: string | number;
}

export function ExitCard({
  label,
  exit,
  geo,
  comparisons,
}: {
  label: string;
  exit: UseQueryResult<ExitData>;
  geo: UseQueryResult<GeoData>;
  comparisons: { title: string; query: UseQueryResult<ExitData> }[];
}) {
  const ip = exit.data?.ip;
  const location =
    [geo.data?.country ?? exit.data?.country_code, geo.data?.city].filter(Boolean).join(' · ') ||
    t('归属地未知');

  return (
    <ToolCard
      title={
        <div className="flex items-center justify-between gap-3">
          <span>
            {label}
            {t('出口')}
          </span>
          <PrivacyToggle />
        </div>
      }>
      <div className="ip-value text-primary">
        {exit.isPending ? <Pending>{t('正在检测出口…')}</Pending> : <IpText ip={ip} />}
      </div>
      {exit.isRefetchError && exit.dataUpdatedAt ? (
        <p className="small muted">
          {t('上次出口结果 · {0}', [new Date(exit.dataUpdatedAt).toLocaleString(locale)])}
        </p>
      ) : null}
      {exit.isError ? (
        <p className="small muted">{t('暂未获取出口，可能受连接或跨域限制。')}</p>
      ) : geo.isFetching ? (
        <p className="small muted">
          <Pending>{t('正在查询归属信息…')}</Pending>
        </p>
      ) : geo.isError ? (
        <p className="small muted">{t('归属信息暂不可用。')}</p>
      ) : (
        <p className="small muted">
          <CountryFlag code={geo.data?.country_code ?? exit.data?.country_code} /> {location}
        </p>
      )}
      <Facts
        rows={[
          [t('运营商'), geo.data?.isp],
          ['ASN', geo.data?.asn],
        ]}
      />
      <div className="ai-exit-comparison">
        <span className="small muted">{t('其他出口对照')}</span>
        {comparisons.map(({ query, title }) => (
          <div className="ai-exit-row" key={title}>
            <span className="muted">{title}</span>
            <span>
              {query.isPending ? (
                <Pending>{t('检测中…')}</Pending>
              ) : query.isError ? (
                <span className="muted">{t('暂不可用')}</span>
              ) : (
                <IpText ip={query.data?.ip} />
              )}
            </span>
          </div>
        ))}
        {comparisons.some(({ query }) => query.isError) && (
          <p className="small muted">{t('对照出口可能受连接或跨域限制。')}</p>
        )}
      </div>
    </ToolCard>
  );
}

export function ExitHistory({
  history,
  onClear,
}: {
  history: { ip: string; time: string }[];
  onClear: () => void;
}) {
  return (
    <>
      <div className="row-between">
        <p className="small muted">{t('仅保存在当前浏览器，最多 20 条')}</p>
        <Button variant="ghost" size="sm" disabled={!history.length} onClick={onClear}>
          {t('清除记录')}
        </Button>
      </div>
      {history.length ? (
        <div className="history-grid">
          {history.map((item) => (
            <div key={item.time}>
              <IpText ip={item.ip} />
              <time>{new Date(item.time).toLocaleString(locale)}</time>
            </div>
          ))}
        </div>
      ) : (
        <p className="small muted">{t('暂无历史记录')}</p>
      )}
    </>
  );
}
