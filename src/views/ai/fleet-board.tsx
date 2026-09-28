import { useEffect } from 'react';

import { Link } from 'react-router-dom';

import { CountryFlag } from '@/components/country-flag';
import { LatencyBadge } from '@/components/latency-badge';
import { NumberTicker } from '@/components/number-ticker';
import { ActionButton, PageHeading, Pending } from '@/components/toolkit';
import { useSortAnimation } from '@/hooks/use-sort-animation';
import { locale, t } from '@/i18n';

import { CampCard } from './camp-card';
import { summarizeCampResults } from './fleet-stats';
import { type AiCamp, aiPlatforms } from './platforms';
import { type AiNetworkItem, useAiNetworkQueries } from './use-ai-network';

type CampStats = {
  responded: number;
  unconfirmed: number;
  restricted: number;
  total: number;
  avg: number | null;
  fastest: AiNetworkItem | undefined;
};

function campStats(items: AiNetworkItem[], pending: boolean): CampStats {
  const responseItems = pending
    ? []
    : items.filter((item) => item.result?.status === 'response' && item.result.median != null);
  const summary = summarizeCampResults(
    pending
      ? []
      : items.map((item) => ({
          median: item.result?.median,
          status: item.result?.status ?? 'unknown',
        }))
  );
  return {
    ...summary,
    fastest: responseItems[0],
  };
}

function CampScore({ camp, stats, pending }: { camp: AiCamp; stats: CampStats; pending: boolean }) {
  return (
    <div className="ai-camp-score" data-camp={camp}>
      <div className="ai-camp-score-title">
        <CountryFlag code={camp} />
        <span>{camp === 'us' ? t('美国阵营') : t('中国阵营')}</span>
      </div>
      <div className="ai-camp-score-metrics">
        <span className="ai-camp-score-metric">
          <span className="ai-fleet-stat-label">{t('已响应')}</span>
          <span className="ai-fleet-stat-value">
            {pending ? (
              <Pending />
            ) : (
              <>
                <NumberTicker value={stats.responded} />
                <span className="ai-fleet-stat-total">/{stats.total}</span>
              </>
            )}
          </span>
        </span>
        <span className="ai-camp-score-metric">
          <span className="ai-fleet-stat-label">{t('未确认')}</span>
          <span className="ai-fleet-stat-value">
            {pending ? <Pending /> : <NumberTicker value={stats.unconfirmed} />}
          </span>
        </span>
        <span className="ai-camp-score-metric">
          <span className="ai-fleet-stat-label">{t('受限')}</span>
          <span className="ai-fleet-stat-value">
            {pending ? <Pending /> : <NumberTicker value={stats.restricted} />}
          </span>
        </span>
        <span className="ai-camp-score-metric">
          <span className="ai-fleet-stat-label">{t('平均延迟')}</span>
          <span className="ai-fleet-stat-value">
            {pending ? (
              <Pending />
            ) : stats.avg != null ? (
              <>
                <NumberTicker value={stats.avg} />
                <span className="ai-fleet-stat-total">ms</span>
              </>
            ) : (
              <span className="muted">—</span>
            )}
          </span>
        </span>
        <span className="ai-camp-score-metric">
          <span className="ai-fleet-stat-label">{t('最快')}</span>
          <span className="ai-fleet-stat-value ai-fleet-stat-fastest">
            {pending ? (
              <Pending />
            ) : stats.fastest?.platform ? (
              <>
                <span className="ai-fleet-stat-name">{stats.fastest.platform.name}</span>
                <LatencyBadge result={stats.fastest.result} running={false} />
              </>
            ) : (
              <span className="muted">—</span>
            )}
          </span>
        </span>
      </div>
    </div>
  );
}

function CampSection({
  camp,
  items,
  pending,
}: {
  camp: AiCamp;
  items: AiNetworkItem[];
  pending: boolean;
}) {
  const sortRef = useSortAnimation(items.map(({ domain }) => domain).join('|'));
  const stats = campStats(items, pending);
  return (
    <section className="ai-camp" data-camp={camp}>
      <header className="ai-camp-header">
        <span className="ai-camp-title">
          <CountryFlag code={camp} />
          {camp === 'us' ? t('美国阵营') : t('中国阵营')}
        </span>
        <span className="ai-camp-header-stats">
          {pending ? (
            <Pending />
          ) : (
            <>
              <span>{t('已响应 {0}/{1}', [stats.responded, stats.total])}</span>
              <span>{t('未确认 {0}', [stats.unconfirmed])}</span>
              <span>{t('受限 {0}', [stats.restricted])}</span>
              {stats.avg != null ? <span>{t('平均 {0}ms', [stats.avg])}</span> : null}
            </>
          )}
        </span>
      </header>
      <div ref={sortRef} className="ai-camp-grid">
        {items.map((item) => (
          <CampCard key={item.domain} item={item} pending={pending} />
        ))}
      </div>
    </section>
  );
}

export function AiFleetBoard() {
  const domains = aiPlatforms.map((platform) => platform.domain);
  const { probeQuery, busy, items, refresh } = useAiNetworkQueries(domains);
  const pending = probeQuery.isPending;
  const usItems = items.filter((item) => item.platform?.camp === 'us');
  const cnItems = items.filter((item) => item.platform?.camp === 'cn');
  const us = campStats(usItems, pending);
  const cn = campStats(cnItems, pending);

  useEffect(() => {
    document.title = t('AI 平台出口与状态 · 出口观测台');
  }, []);

  return (
    <div className="module-overview ai-fleet space-y-4">
      <PageHeading
        title={t('AI 出口')}
        description={t(
          '按平台与线路分组查看连通与出口；公开端点可响应 ≠ 可登录、可对话或已获得地区授权。'
        )}
        actions={
          <ActionButton
            type="button"
            size="sm"
            variant="outline"
            className="self-start shrink-0"
            busy={busy}
            onClick={() => void refresh()}>
            {busy ? t('检测中...') : t('重新检测')}
          </ActionButton>
        }
      />
      <div className="ai-versus-scoreboard" aria-busy={busy}>
        <CampScore camp="us" stats={us} pending={pending} />
        <div className="ai-versus-mark" aria-hidden="true">
          <span>VS</span>
        </div>
        <CampScore camp="cn" stats={cn} pending={pending} />
      </div>
      {probeQuery.isRefetchError && probeQuery.dataUpdatedAt ? (
        <p className="small muted">
          {t('上次结果 · {0}', [new Date(probeQuery.dataUpdatedAt).toLocaleString(locale)])}
        </p>
      ) : null}
      <div className="ai-camp-versus">
        <CampSection camp="us" items={usItems} pending={pending} />
        <div className="ai-camp-divider" aria-hidden="true">
          <span>VS</span>
        </div>
        <CampSection camp="cn" items={cnItems} pending={pending} />
      </div>
      {probeQuery.error ? (
        <p className="small text-destructive">{t('网络检测失败，请重试。')}</p>
      ) : (
        <>
          <p className="small muted">
            {t(
              '站点资源响应不等于登录或对话可用；无实测接口的平台会标注 HTTP 默认出口、UDP 观察出口或分流，仅说明探测来源看到的地址。'
            )}
          </p>
          <p className="ai-network-privacy small muted">
            <span>
              {t(
                '本页会从当前浏览器直接请求目标站点、出口回显服务和部分 WebRTC/STUN 服务；这些第三方请求可能看到你的出口 IP，且不会发送账号凭据。'
              )}
            </span>{' '}
            <Link to="/privacy">{t('查看数据来源与隐私说明')}</Link>
          </p>
        </>
      )}
    </div>
  );
}
