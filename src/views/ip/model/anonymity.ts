import type { CrossReading } from './cross-intel';

export interface AnonymitySignals {
  vpn: boolean | null;
  proxy: boolean | null;
  tor: boolean | null;
  relay: boolean | null;
  residentialProxy: boolean | null;
  hosting: boolean | null;
  /** A combined provider flag, never a vote for a specific technology. */
  anonymous: boolean | null;
  untypedAnonymous: boolean;
}

export const unknownAnonymity: AnonymitySignals = {
  vpn: null,
  proxy: null,
  tor: null,
  relay: null,
  residentialProxy: null,
  hosting: null,
  anonymous: null,
  untypedAnonymous: false,
};

export function typedAnonymousHit(source: AnonymitySignals) {
  return (
    source.vpn === true ||
    source.proxy === true ||
    source.tor === true ||
    source.relay === true ||
    source.residentialProxy === true
  );
}

export function anonymousHit(source: AnonymitySignals) {
  return typedAnonymousHit(source) || source.untypedAnonymous;
}

/** A partial negative cannot disprove technologies the source did not check. */
export function anonymousNegative(source: AnonymitySignals) {
  return (
    !anonymousHit(source) &&
    (source.anonymous === false ||
      (source.vpn === false && source.proxy === false && source.tor === false))
  );
}

export function readingAnonymity(reading: CrossReading): AnonymitySignals {
  const signals = { ...unknownAnonymity };
  if (reading.flags) {
    for (const key of [
      'vpn',
      'proxy',
      'tor',
      'relay',
      'residentialProxy',
      'hosting',
      'anonymous',
    ] as const) {
      const value = reading.flags[key];
      if (typeof value === 'boolean') signals[key] = value;
    }
    signals.untypedAnonymous = signals.anonymous === true;
    return signals;
  }

  // Old flattened "No" values may have been fabricated from missing fields.
  // Preserve affirmative legacy labels, never invent negative evidence.
  const value = reading.value.trim().toLowerCase();
  if (value === 'no' || value.includes('未检测') || value.includes('未检出')) return signals;
  if (
    reading.source === 'ipapi' ||
    value === 'anonymous' ||
    value === 'vpn / proxy / tor' ||
    value.startsWith('匿名出口')
  ) {
    signals.anonymous = true;
    signals.untypedAnonymous = true;
    return signals;
  }
  if (/vpn/.test(value)) signals.vpn = true;
  if (/proxy|\bpub\b|\bweb\b/.test(value)) signals.proxy = true;
  if (/\btor\b/.test(value)) signals.tor = true;
  if (/relay|\baic\b/.test(value)) signals.relay = true;
  if (/residential proxy|\bres\b/.test(value)) signals.residentialProxy = true;
  if (/\bdch\b|hosting|server/.test(value)) signals.hosting = true;
  return signals;
}

/** Within one provider, a positive takes precedence; unknown never erases a reading. */
export function mergeAnonymity(target: AnonymitySignals, incoming: AnonymitySignals) {
  for (const key of [
    'vpn',
    'proxy',
    'tor',
    'relay',
    'residentialProxy',
    'hosting',
    'anonymous',
  ] as const) {
    if (incoming[key] === true || target[key] == null) target[key] = incoming[key];
  }
  target.untypedAnonymous ||= incoming.untypedAnonymous;
}
