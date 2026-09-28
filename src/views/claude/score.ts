import {
  type DetectOutcome,
  type DetectionStatus,
  SIGNALS,
  type SignalDef,
} from '../../../vendor/claude-environment/signals';

export async function detectSignal(definition: SignalDef): Promise<DetectOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => definition.detect()),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Detection timed out')), 4000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function outcomeStatus(outcome: DetectOutcome | undefined): DetectionStatus | 'pending' {
  if (!outcome) return 'pending';
  if (outcome.status) return outcome.status;
  if (/unavailable|blocked|failed|timed out/i.test(outcome.raw)) return 'unavailable';
  if (/unknown|not detected|not available/i.test(outcome.raw)) return 'unknown';
  return 'observed';
}

export function summarizeSignals(outcomes: (DetectOutcome | undefined)[]) {
  const statuses = SIGNALS.map((_, i) => outcomeStatus(outcomes[i]));
  const observedCount = statuses.filter((status) => status === 'observed').length;
  const unknownCount = statuses.filter((status) => status === 'unknown').length;
  const unavailableCount = statuses.filter((status) => status === 'unavailable').length;
  const pendingCount = statuses.filter((status) => status === 'pending').length;
  return {
    observedCount,
    unknownCount,
    unavailableCount,
    pendingCount,
    complete: pendingCount === 0 && unknownCount === 0 && unavailableCount === 0,
    status:
      pendingCount > 0
        ? 'pending'
        : unavailableCount > 0
          ? 'unavailable'
          : unknownCount > 0
            ? 'unknown'
            : 'complete',
  };
}
