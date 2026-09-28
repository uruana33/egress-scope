export function ipScoreColor(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score) || score < 0 || score > 100)
    return 'var(--muted-foreground)';
  return score >= 80
    ? 'var(--success)'
    : score >= 60
      ? 'var(--warning)'
      : score >= 40
        ? 'var(--caution)'
        : 'var(--danger)';
}

/**
 * Estimate styling: keep the band hue but pull it toward neutral so a
 * provisional score shows what the evidence says without claiming the
 * confidence of a fully covered one.
 */
export function ipScoreEstimateColor(score: number | null | undefined): string {
  const base = ipScoreColor(score);
  if (base === 'var(--muted-foreground)') return base;
  return `color-mix(in srgb, ${base} 55%, var(--muted-foreground))`;
}
