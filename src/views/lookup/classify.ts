export type LookupKind = 'ip' | 'domain' | 'unknown';

export interface ClassifiedLookup {
  kind: LookupKind;
  /** Canonical value sent to the data sources. */
  value: string;
  /** Trimmed original input. */
  input: string;
  /** True when a pasted URL was reduced to its hostname. */
  strippedUrl: boolean;
  /** True for www.example.com style names that often lack their own record. */
  subdomainHint: boolean;
}

const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;

function isIpv4(value: string) {
  if (!IPV4.test(value)) return false;
  return value.split('.').every((part) => {
    const n = Number(part);
    return n <= 255 && String(n) === part;
  });
}

function isIpv6(value: string) {
  if (!value.includes(':')) return false;
  try {
    return (
      new URL(`https://[${value}]/`).hostname === value.toLowerCase() ||
      new URL(`https://[${value}]/`).hostname.length > 0
    );
  } catch {
    return false;
  }
}

function hostnameOf(raw: string) {
  try {
    const url = /:\/\//.test(raw) ? new URL(raw) : new URL(`https://${raw}`);
    if (url.username || url.password) return '';
    return url.hostname.replace(/\.$/, '');
  } catch {
    return '';
  }
}

function looksLikeUrl(raw: string) {
  return /^https?:\/\//i.test(raw) || /[/?#]/.test(raw);
}

function asDomain(value: string): ClassifiedLookup | null {
  if (!value || /[\s@:]$/.test(value) || value.startsWith('[')) return null;
  const host = hostnameOf(value);
  if (!host || isIpv4(host) || isIpv6(host) || !host.includes('.')) return null;
  const labels = host.split('.').filter(Boolean);
  return {
    kind: 'domain',
    value: host,
    input: value,
    strippedUrl: looksLikeUrl(value) || host !== value,
    subdomainHint: labels[0] === 'www' && labels.length > 2,
  };
}

/**
 * Decide which result sections a pasted string should open.
 * Beginners often paste a full URL; that is reduced to a hostname first.
 */
export function classifyLookup(raw: string): ClassifiedLookup {
  const input = raw.trim();
  const empty = {
    kind: 'unknown' as const,
    value: '',
    input,
    strippedUrl: false,
    subdomainHint: false,
  };
  if (!input) return empty;

  if (isIpv4(input) || isIpv6(input))
    return {
      kind: 'ip',
      value: input,
      input,
      strippedUrl: false,
      subdomainHint: false,
    };

  if (looksLikeUrl(input)) {
    const host = hostnameOf(input);
    if (!host) return { ...empty, value: input };
    return classifyLookup(host).kind === 'unknown'
      ? { ...empty, value: input }
      : { ...classifyLookup(host), input, strippedUrl: true };
  }

  return asDomain(input) ?? { ...empty, value: input };
}

export const LOOKUP_EXAMPLES = ['1.1.1.1', 'qq.com'] as const;
