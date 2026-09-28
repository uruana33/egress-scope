import { ArrowUpRight, ChevronDown } from 'lucide-react';

import { t } from '@/i18n';
import { ipScoreColor, ipScoreEstimateColor } from '@/lib/ip-score';
import { maskedIp } from '@/lib/network';

import { type QualityAssessment, qualityScoreNotice } from '../model/quality';
import type { TerminalEgressReading } from '../model/terminal-egress';
import { TerminalEgressPanel } from './terminal-egress-panel';

function maskTerminal(text: string, ip: string | undefined, hidden: boolean) {
  if (!hidden || !ip) return text;
  return text.split(ip).join(maskedIp(ip, true));
}

function FormulaBody({ assessment }: { assessment: QualityAssessment }) {
  const { indicators, cap, penalties, evidenceCoverage, range } = assessment.scoreBreakdown;
  const saturation = Math.min(1, evidenceCoverage / 0.75);
  const display = (value: number | null) =>
    value == null ? t('未返回') : String(Math.round(value));
  const coverageLevel =
    assessment.scoreBreakdown.confidence === 'high'
      ? t('高')
      : assessment.scoreBreakdown.confidence === 'medium'
        ? t('中')
        : t('低');
  const rangeText =
    range == null
      ? display(null)
      : range.lo === range.hi
        ? String(range.lo)
        : t('{0}–{1}', [range.lo, range.hi]);
  return (
    <div className="ip-folio-formula">
      <p className="ip-folio-formula-eq">S = min(60 + min(1, E/75%)·(B·P − 60), C)</p>
      <dl>
        {indicators.map((row) => (
          <div key={row.key}>
            <dt>
              {row.label}
              <span>
                {t('原始 {0}% · 有效 {1}%', [
                  Math.round(row.weight * 100),
                  Math.round(row.effective * 100),
                ])}
              </span>
            </dt>
            <dd>{display(row.score)}</dd>
          </div>
        ))}
        {penalties.map((penalty) => (
          <div key={penalty.key} data-tone="warn">
            <dt>{penalty.label}</dt>
            <dd>{t('×{0}', [penalty.factor])}</dd>
          </div>
        ))}
        <div>
          <dt>{t('证据覆盖')}</dt>
          <dd>{t('{0}%', [Math.round(evidenceCoverage * 100)])}</dd>
        </div>
        <div>
          <dt>{t('覆盖饱和度')}</dt>
          <dd>{t('{0}%', [Math.round(saturation * 100)])}</dd>
        </div>
        <div>
          <dt>{t('覆盖等级')}</dt>
          <dd>{coverageLevel}</dd>
        </div>
        <div>
          <dt>{t('风险上限')}</dt>
          <dd>{cap}</dd>
        </div>
        <div>
          <dt>{t('中心分')}</dt>
          <dd>{display(assessment.score)}</dd>
        </div>
        <div data-result="true">
          <dt>{t('质量区间')}</dt>
          <dd>{rangeText}</dd>
        </div>
      </dl>
      <p className="ip-folio-formula-note">
        {t(
          '七项指标按原始系数加权，缺项按已读指标重归一化为有效权重；E 为证据覆盖，实际饱和度为 min(1, E/75%)。缺失指标按悲观/乐观锚点填充得出区间上下界，证据越薄区间越宽。中心分向中性 60 收敛；区间是证据边界，不是统计置信区间。'
        )}
      </p>
      <p className="ip-folio-formula-note">{t('覆盖等级是证据覆盖等级，不是统计置信度。')}</p>
      <p className="ip-folio-formula-note">
        {t('登记日期不计分；IPQS 与 AbuseIPDB 仅在配置密钥后计入。')}
      </p>
    </div>
  );
}

/**
 * Evidence-bounded interval on the 0–100 spectrum. The fill spans what the
 * observed sources still allow once missing indicators are bounded; a
 * provisional score keeps the band hue but desaturated.
 */
function ScoreRange({ assessment }: { assessment: QualityAssessment }) {
  const range = assessment.scoreBreakdown.range;
  const score = assessment.score;
  // While sources are still being read the partial-evidence range would
  // jump as each lands — show "?" until the batch settles.
  const waiting = assessment.pending === true;
  const empty = range == null || score == null;
  if (waiting || empty) {
    const waitLabel = waiting ? t('读取中…') : t('暂无读数');
    return (
      <div
        className="ip-folio-range"
        role="img"
        aria-label={t('质量区间 {0}，{1}', ['?', waitLabel])}>
        <div className="ip-folio-range-head">
          <span>{t('质量区间')}</span>
          <strong>{waitLabel}</strong>
        </div>
        <div className="ip-folio-range-track">
          <span className="ip-folio-range-value ip-folio-range-unknown">?</span>
        </div>
        <div className="ip-folio-range-scale">
          <span>0</span>
          <span>100</span>
        </div>
      </div>
    );
  }
  const color =
    assessment.scoreStatus === 'provisional' ? ipScoreEstimateColor(score) : ipScoreColor(score);
  const width = Math.max(0, range.hi - range.lo);
  const mid = Math.min(86, Math.max(14, (range.lo + range.hi) / 2));
  const text = width === 0 ? String(score) : `${range.lo}–${range.hi}`;
  const label = t('质量区间 {0}，中心分 {1}，{2}', [text, score, assessment.bandLabel]);
  return (
    <div className="ip-folio-range" role="img" aria-label={label} title={label}>
      <div className="ip-folio-range-head">
        <span>{t('质量区间')}</span>
        <strong data-tone={assessment.band}>{text}</strong>
        <small>
          {t('中心分 {0}', [score])} · {assessment.bandLabel}
        </small>
      </div>
      <div className="ip-folio-range-track">
        <span
          className="ip-folio-range-fill"
          style={{
            left: `${range.lo}%`,
            width: `${Math.max(width, 3)}%`,
            background: color,
            color,
          }}
        />
        <span className="ip-folio-range-value" style={{ left: `${mid}%`, color }}>
          {text}
        </span>
      </div>
      <div className="ip-folio-range-scale">
        <span>0</span>
        <span>100</span>
      </div>
    </div>
  );
}

function QualityConclusion({
  assessment,
  hidden,
}: {
  assessment: QualityAssessment;
  hidden: boolean;
}) {
  const applicable = assessment.sources.filter(
    (source) => source.status !== 'outbound' && source.status !== 'not-applicable'
  ).length;
  const estimate = assessment.scoreStatus === 'provisional';
  const details = [
    ...new Set(maskTerminal(assessment.summary, assessment.terminalIp, hidden).split(' · ')),
  ];
  return (
    <section className="ip-folio-quality" data-tone={assessment.band} aria-label={t('质量结论')}>
      <div className="ip-folio-quality-heading">
        <p className="ip-folio-kicker">{t('质量评估')}</p>
        {estimate ? (
          <span className="ip-folio-estimate" title={qualityScoreNotice(assessment)}>
            {t('估算')}
          </span>
        ) : null}
      </div>
      <div className="ip-folio-quality-hero">
        <ScoreRange assessment={assessment} />
        <div className="ip-folio-quality-copy">
          <strong className="ip-folio-quality-kind">{assessment.headline}</strong>
          <p className="ip-folio-quality-summary">{assessment.shortSummary}</p>
          <ul className="ip-folio-quality-tags" aria-label={t('关键判断')}>
            {assessment.tags.map((tag) => (
              <li key={tag.label} data-tone={tag.tone}>
                {tag.label}
              </li>
            ))}
          </ul>
        </div>
        {assessment.keyEvidence.rows.length ? (
          <div className="ip-folio-quality-proof">
            <p className="ip-folio-proof-title">{assessment.keyEvidence.title}</p>
            <dl>
              {assessment.keyEvidence.rows.map((row) => (
                <div key={row.source}>
                  <dt>{row.source}</dt>
                  <dd data-tone={row.tone}>{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
      </div>
      <details className="ip-folio-quality-details">
        <summary>
          <span>
            {t('已读 {0}/{1} 个来源', [assessment.sourcesReady, applicable])}
            {assessment.pending ? ` · ${t('更新中')}` : ''}
          </span>
          <span className="ip-folio-details-action">
            {t('查看依据')}
            <ChevronDown size={14} aria-hidden="true" />
          </span>
        </summary>
        <div className="ip-folio-quality-expanded">
          <div className="ip-folio-reasons">
            <h3>{t('来源说明')}</h3>
            <ul>
              {details.map((detail, index) => (
                <li key={index}>{detail}</li>
              ))}
            </ul>
            <p>{qualityScoreNotice(assessment)}</p>
            <p>
              {t('有效来源：{0}', [
                assessment.scoreBreakdown.indicators
                  .map((item) => `${item.label} ${item.sources.length}`)
                  .join(' · '),
              ])}
            </p>
          </div>
          <div className="ip-folio-calculation">
            <h3>{t('计算方式')}</h3>
            <FormulaBody assessment={assessment} />
          </div>
          <div className="ip-folio-quality-footnote">
            {assessment.publicService ? (
              <p>
                <a href={assessment.publicService.href} target="_blank" rel="noopener noreferrer">
                  {t('官方用途记录：{0}', [assessment.publicService.label])}
                </a>
                {' · '}
                {assessment.publicService.verifiedAt.slice(0, 10)}
              </p>
            ) : null}
            {assessment.checkedAt ? (
              <p>{t('来源读取于 {0}', [new Date(assessment.checkedAt).toLocaleString()])}</p>
            ) : null}
            <p>{t('分数用于比较已读风险信号，不代表平台通过率或账号安全。')}</p>
          </div>
        </div>
      </details>
    </section>
  );
}

function QualityDimensions({
  assessment,
  hidden,
}: {
  assessment: QualityAssessment;
  hidden: boolean;
}) {
  const dims = [
    assessment.network,
    assessment.reputation,
    ...(assessment.freshness ? [assessment.freshness] : []),
    ...(assessment.runtime ? [assessment.runtime] : []),
  ];
  return (
    <ul className="ip-folio-dims" data-count={dims.length} aria-label={t('评估维度')}>
      {dims.map((dim) => (
        <li key={dim.id} className="ip-folio-dim" data-tone={dim.tone}>
          <span className="ip-folio-dim-label">{dim.label}</span>
          <strong>{dim.value}</strong>
          {dim.hint ? (
            <span className="ip-folio-dim-hint">
              {maskTerminal(dim.hint, assessment.terminalIp, hidden)}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function SourceEvidenceCard({ source }: { source: QualityAssessment['sources'][number] }) {
  const { headline, rows } = source;
  return (
    <a
      className="ip-folio-evidence-card"
      href={source.href}
      target="_blank"
      rel="noopener noreferrer"
      data-status={source.status}
      data-tone={source.tone}
      data-kind={headline.kind}
      title={t('在 {0} 查看详情', [source.name])}>
      <span className="ip-folio-evidence-head">
        <span className="ip-folio-evidence-name">
          <strong>{source.name}</strong>
          <span>{source.metric}</span>
        </span>
        <ArrowUpRight aria-hidden="true" className="ip-folio-evidence-icon" />
      </span>
      <span className="ip-folio-evidence-hero" data-kind={headline.kind} data-tone={headline.tone}>
        <strong>
          {headline.value}
          {headline.kind === 'score' ? <span>/100</span> : null}
        </strong>
        <em>{headline.caption}</em>
      </span>
      {rows.length ? (
        <dl className="ip-folio-evidence-rows">
          {rows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd data-tone={row.tone} title={row.value}>
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      <span className="ip-folio-evidence-why">{source.why}</span>
    </a>
  );
}

function SourceEvidenceList({ assessment }: { assessment: QualityAssessment }) {
  return (
    <section className="ip-folio-evidence" aria-label={t('评分依据')}>
      <p className="ip-folio-kicker">{t('评分依据')}</p>
      <ul className="ip-folio-evidence-list">
        {assessment.sources.map((source) => (
          <li key={source.id}>
            <SourceEvidenceCard source={source} />
          </li>
        ))}
      </ul>
      {assessment.pending ? (
        <p className="ip-folio-checks-kicker">{t('正在读取其它来源…')}</p>
      ) : null}
    </section>
  );
}

export function QualityBoard({
  assessment,
  queriedIp,
  terminal,
  terminalError,
  hidden,
  onTerminalPaste,
  onTerminalClear,
}: {
  assessment: QualityAssessment;
  queriedIp: string;
  terminal: TerminalEgressReading | null;
  terminalError: string | null;
  hidden: boolean;
  onTerminalPaste: (value: string) => boolean;
  onTerminalClear: () => void;
}) {
  return (
    <>
      <QualityConclusion assessment={assessment} hidden={hidden} />
      <QualityDimensions assessment={assessment} hidden={hidden} />
      <TerminalEgressPanel
        queriedIp={queriedIp}
        reading={terminal}
        error={terminalError}
        hidden={hidden}
        onSubmit={onTerminalPaste}
        onClear={onTerminalClear}
      />
      <SourceEvidenceList assessment={assessment} />
    </>
  );
}
