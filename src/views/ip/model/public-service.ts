import { normalizeIp } from '@/lib/diagnostics';

export interface PublicServiceIdentity {
  id: string;
  provider: string;
  label: string;
  href: string;
  verifiedAt: string;
  expiresAt: string;
}

const VERIFIED_AT = '2026-09-18T16:52:12Z';
// Reviewed maintenance interval, not an upstream freshness guarantee.
const EXPIRES_AT = new Date(Date.parse(VERIFIED_AT) + 180 * 86_400_000).toISOString();

const IDENTITIES: Record<string, PublicServiceIdentity> = {
  '1.1.1.1': {
    id: 'cloudflare-public-dns-v4-primary',
    provider: 'Cloudflare',
    label: 'Cloudflare Public DNS',
    href: 'https://developers.cloudflare.com/1.1.1.1/ip-addresses/',
    verifiedAt: VERIFIED_AT,
    expiresAt: EXPIRES_AT,
  },
  '1.0.0.1': {
    id: 'cloudflare-public-dns-v4-secondary',
    provider: 'Cloudflare',
    label: 'Cloudflare Public DNS',
    href: 'https://developers.cloudflare.com/1.1.1.1/ip-addresses/',
    verifiedAt: VERIFIED_AT,
    expiresAt: EXPIRES_AT,
  },
  '2606:4700:4700::1111': {
    id: 'cloudflare-public-dns-v6-primary',
    provider: 'Cloudflare',
    label: 'Cloudflare Public DNS',
    href: 'https://developers.cloudflare.com/1.1.1.1/ip-addresses/',
    verifiedAt: VERIFIED_AT,
    expiresAt: EXPIRES_AT,
  },
  '8.8.8.8': {
    id: 'google-public-dns-v4-primary',
    provider: 'Google',
    label: 'Google Public DNS',
    href: 'https://developers.google.com/speed/public-dns/docs/using',
    verifiedAt: VERIFIED_AT,
    expiresAt: EXPIRES_AT,
  },
  '8.8.4.4': {
    id: 'google-public-dns-v4-secondary',
    provider: 'Google',
    label: 'Google Public DNS',
    href: 'https://developers.google.com/speed/public-dns/docs/using',
    verifiedAt: VERIFIED_AT,
    expiresAt: EXPIRES_AT,
  },
  '2001:4860:4860::8888': {
    id: 'google-public-dns-v6-primary',
    provider: 'Google',
    label: 'Google Public DNS',
    href: 'https://developers.google.com/speed/public-dns/docs/using',
    verifiedAt: VERIFIED_AT,
    expiresAt: EXPIRES_AT,
  },
  '9.9.9.9': {
    id: 'quad9-public-dns-v4-primary',
    provider: 'Quad9',
    label: 'Quad9 Public DNS',
    href: 'https://quad9.net/service/service-addresses-and-features/',
    verifiedAt: VERIFIED_AT,
    expiresAt: EXPIRES_AT,
  },
  '149.112.112.112': {
    id: 'quad9-public-dns-v4-secondary',
    provider: 'Quad9',
    label: 'Quad9 Public DNS',
    href: 'https://quad9.net/service/service-addresses-and-features/',
    verifiedAt: VERIFIED_AT,
    expiresAt: EXPIRES_AT,
  },
};

/**
 * Exact service endpoints verified against the operator URLs above on VERIFIED_AT.
 * Maintained independently of evaluation labels. Identifies usage only; never
 * supplies reputation scores or negative anonymity observations.
 */
export function identifyPublicService(ip: string, now = Date.now()): PublicServiceIdentity | null {
  const normalized = normalizeIp(ip);
  if (!normalized || !Number.isFinite(now)) return null;
  const identity = Object.hasOwn(IDENTITIES, normalized.ip) ? IDENTITIES[normalized.ip] : null;
  if (!identity || now < Date.parse(identity.verifiedAt) || now >= Date.parse(identity.expiresAt))
    return null;
  return { ...identity };
}
