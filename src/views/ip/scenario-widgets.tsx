import { Info, Star } from 'lucide-react';

import { Pending } from '@/components/toolkit';
import { Badge } from '@/components/ui/badge';
import { t } from '@/i18n';

import type { Evidence, EvidenceState } from './scenario-evidence';
import { summarizeAccessScopes } from './scenario-evidence';
import { metricLabels, stateLabels, stateTone } from './scenario-labels';

export function StateBadge({ state }: { state: EvidenceState }) {
  return (
    <Badge variant={stateTone(state)}>
      {state === 'running' ? <Pending>{stateLabels[state]}</Pending> : stateLabels[state]}
    </Badge>
  );
}

export function ScenarioStars({ stars, showValue = true }: { stars: number; showValue?: boolean }) {
  return (
    <span
      className="ip-scenario-stars"
      data-rating={Math.floor(stars)}
      aria-label={t('评分：{0}/5', [stars])}>
      {Array.from({ length: 5 }, (_, index) => (
        <span key={index} className="ip-scenario-star" aria-hidden="true">
          <Star size={12} />
          <span
            className="ip-scenario-star-fill"
            style={{ width: `${Math.min(1, Math.max(0, stars - index)) * 100}%` }}>
            <Star size={12} className="is-filled" />
          </span>
        </span>
      ))}
      {showValue && <span>{stars}/5</span>}
    </span>
  );
}

export function AccessScopeSummary({
  summary,
  busy,
}: {
  summary: ReturnType<typeof summarizeAccessScopes>;
  busy: boolean;
}) {
  const scopeLine = summary.measured
    ? t('出口核验：{0} 个平台与查询 IP 一致，{1} 个不同，{2} 个未核验。', [
        summary.ip,
        summary.different,
        summary.browser,
      ])
    : busy
      ? t('正在取得平台响应；出口核验随结果显示。')
      : t('尚未取得平台响应。');
  return (
    <div className="mb-3 space-y-1 text-xs text-muted-foreground">
      <p>
        <span className="font-medium text-foreground">{t('访问范围')}</span>：
        {t('当前浏览器直接访问公开端点')}
      </p>
      <p>{scopeLine}</p>
      {summary.different > 0 && (
        <Badge variant="warning">{t('部分平台出口与查询 IP 不一致')}</Badge>
      )}
      <p>{t('星级仅描述当前浏览器访问公开端点的响应速度，不等于查询 IP 的平台可用性。')}</p>
    </div>
  );
}

function medianOf(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(
    (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2
  );
}

const metricValue = (key: string, value: unknown) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return t('未知');
  if (key === 'packetLoss') return `${(value * 100).toFixed(1)}%`;
  if (key === 'download' || key === 'upload') return `${(value / 1e6).toFixed(1)} Mbps`;
  return `${Math.round(value)} ms`;
};

export function EvidenceDetails({ evidence }: { evidence: Evidence }) {
  const count = (outcome: string) =>
    evidence.samples.filter((sample) => sample.outcome === outcome).length;
  const median = medianOf(
    evidence.samples
      .filter((sample) => ['readable', 'opaque'].includes(sample.outcome))
      .map((sample) => sample.elapsedMs)
  );
  const statuses = [
    ...new Set(evidence.samples.map((sample) => sample.status).filter(Boolean)),
  ].join(' / ');

  return (
    <div className="ip-measurement-detail">
      <p>
        {t('测量来源')}：{evidence.source} · {evidence.protocol} ·{' '}
        {evidence.addressFamily === 'unknown' ? t('地址族未核验') : evidence.addressFamily}
      </p>
      <p>
        {evidence.direction === 'probe-inbound'
          ? t('远端探针 → 查询 IP')
          : t('当前浏览器 → 目标服务')}
        ：<span className="break-all">{evidence.target}</span>
      </p>
      {evidence.direction === 'browser-outbound' && (
        <p>
          {t('测量出口')}：{evidence.egressBefore ?? t('未知')} →{' '}
          {evidence.egressAfter ?? t('未知')}
        </p>
      )}
      <p>
        {t('检测时间')}：{new Date(evidence.checkedAt).toLocaleTimeString()} · {t('有效期 5 分钟')}
      </p>
      {!!evidence.samples.length && (
        <>
          <p>
            {t('样本 {0} 次，可读响应 {1} 次，不透明响应 {2} 次', [
              evidence.samples.length,
              count('readable'),
              count('opaque'),
            ])}
            {median !== null && ` · ${t('HTTP 耗时中位数')} ${median} ms`}
          </p>
          <p>
            {t('HTTP 状态')}：{statuses || t('无法读取')}
          </p>
        </>
      )}
      {evidence.metrics && (
        <dl className="ip-measurement-metrics">
          {Object.entries(metricLabels)
            .filter(([key]) => key in evidence.metrics!)
            .map(([key, label]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>{metricValue(key, evidence.metrics![key as keyof typeof evidence.metrics])}</dd>
              </div>
            ))}
        </dl>
      )}
      <details>
        <summary>{t('查看原始样本')}</summary>
        <pre className="max-h-36 overflow-auto whitespace-pre-wrap break-all text-[10px]">
          {JSON.stringify(evidence.raw ?? evidence.samples, null, 2)}
        </pre>
      </details>
    </div>
  );
}

export function PartialNote({ visible }: { visible: boolean }) {
  return (
    <span
      className="ip-scenario-partial"
      data-visible={visible}
      title={visible ? t('部分结果') : undefined}
      aria-label={visible ? t('部分结果') : undefined}
      aria-hidden={!visible}>
      <Info size={11} aria-hidden="true" />
    </span>
  );
}
