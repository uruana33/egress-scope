import type { CSSProperties } from 'react';

import { NumberTicker } from '@/components/number-ticker';
import { t } from '@/i18n';
import { ipScoreColor, ipScoreEstimateColor } from '@/lib/ip-score';

/**
 * Quality score readout. The numeral is the subject; the arc is a halo.
 * Home uses `sm`. The address dossier uses `lg`.
 */
const ARC = { view: 100, radius: 40 } as const;
const STROKE = { sm: 8, lg: 6.5 } as const;

export type TrustGaugeSize = keyof typeof STROKE;

function bandLabel(score: number) {
  if (score >= 80) return t('比较好');
  if (score >= 60) return t('需核实');
  if (score >= 40) return t('较差');
  return t('明显有问题');
}

export function TrustGauge({
  score,
  size = 'sm',
  caption = t('质量分'),
  hint,
  verdict: verdictOverride,
  uncertain = false,
}: {
  /** `null` when the source gave no usable score: shown as unknown, never 0. */
  score: number | null;
  size?: TrustGaugeSize;
  caption?: string;
  hint?: string;
  verdict?: string;
  uncertain?: boolean;
}) {
  const color = uncertain && score != null ? ipScoreEstimateColor(score) : ipScoreColor(score);
  const verdict = score == null ? t('数据不足') : (verdictOverride ?? bandLabel(score));
  const label = `${caption} ${score ?? '—'}，${verdict}`;

  if (score == null)
    return (
      <div
        className="trust-gauge"
        data-size={size}
        data-empty="true"
        title={hint}
        role="img"
        aria-label={label}>
        <div className="trust-gauge-ring">
          <span className="trust-gauge-value">—</span>
        </div>
        <div className="trust-gauge-text">
          <span className="trust-gauge-caption">{caption}</span>
          <span className="trust-gauge-verdict">{verdict}</span>
        </div>
      </div>
    );

  const stroke = STROKE[size];
  const filled = Math.min(100, Math.max(0, score));
  const { view, radius } = ARC;
  const centre = view / 2;

  return (
    <div
      className="trust-gauge"
      data-size={size}
      title={hint}
      role="img"
      aria-label={label}
      style={{ '--score-color': color } as CSSProperties}>
      <div className="trust-gauge-ring">
        <svg viewBox={`0 0 ${view} ${view}`} aria-hidden="true">
          <circle
            cx={centre}
            cy={centre}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            className="trust-gauge-track"
          />
          <circle
            cx={centre}
            cy={centre}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray="100 100"
            strokeDashoffset={100 - filled}
            className="trust-gauge-arc hud-gauge-circle"
          />
        </svg>
        <strong className="trust-gauge-value">
          <NumberTicker value={score} duration={size === 'lg' ? 0.7 : 0.5} snap={1} />
        </strong>
      </div>
      <div className="trust-gauge-text">
        <span className="trust-gauge-caption">{caption}</span>
        <span className="trust-gauge-verdict">{verdict}</span>
      </div>
    </div>
  );
}
