const ACTIVE_INDICATORS = ['minor', 'major', 'critical', 'maintenance'];

/** Incidents and maintenance first, operational next, unconfirmed last. */
export function statusOrder(indicator?: string) {
  if (ACTIVE_INDICATORS.includes(indicator ?? '')) return 0;
  if (indicator === 'none') return 1;
  return 2;
}
