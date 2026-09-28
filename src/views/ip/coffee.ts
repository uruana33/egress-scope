import type { Geo, Lookup } from '@/lib/types';

type SeenAt = { seen_at?: number };

export interface CoffeeIp {
  // Identity & routing
  ip: string;
  cidr?: string;
  asn?: number;
  asn_kind?: string;
  asOrganization?: string;
  asname?: string;
  asn_tbps?: string;
  asn_ipv4_count?: number;
  asn_allocated?: string;
  rdns?: string;
  rpki_status?: string;
  range?: { first?: string; last?: string; count?: number; prefix?: number };
  // Geography
  country?: string;
  countryCode?: string;
  region?: string;
  city?: string;
  registered_country_code?: string;
  registered_country?: string;
  // Operator classification
  company_name?: string;
  company_type?: string;
  isp?: string;
  datacenter_name?: string;
  // Verdict flags
  trust_score?: number;
  is_public_service?: boolean;
  is_bogon?: boolean;
  is_datacenter?: boolean;
  isResidential?: boolean;
  is_vpn?: boolean;
  is_proxy?: boolean;
  is_tor?: boolean;
  is_crawler?: boolean;
  is_abuser?: boolean;
  is_mobile?: boolean;
  reddit_blocked?: boolean;
  abuser_score?: string;
  // Enrichment payloads
  vpn_trace?: unknown;
  ai_verdict?: { label?: string; confidence?: number; reasoning?: string };
  intelligence?: {
    threats?: (string | { label: string; severity?: string })[];
    abuser_level?: string;
    abuser_score_raw?: string;
    rep_threat?: unknown;
  };
  related_domains?: { domain: string; via?: string }[];
  // Time-series records
  location_history?: ({ country?: string; region?: string; city?: string } & SeenAt)[];
  asn_history?: ({ asn?: number; asn_org?: string } & SeenAt)[];
  company_history?: ({ company_name?: string; company_type?: string } & SeenAt)[];
  dc_neighbors?: ({
    ip: string;
    country_code?: string;
    city?: string;
    company?: string;
  } & SeenAt)[];
  geo_sources?: {
    src?: string;
    country?: string;
    country_code?: string;
    region?: string;
    city?: string;
    lat?: number | null;
    lon?: number | null;
  }[];
}

export interface CoffeeLookup extends Lookup {
  coffee: CoffeeIp;
}

export function coffeeThreatLabels(data: CoffeeIp, riskOnly = false): string[] {
  const result: string[] = [];
  for (const threat of data.intelligence?.threats ?? []) {
    const severity = typeof threat === 'string' ? undefined : threat.severity?.toLowerCase();
    if (riskOnly && severity === 'info') continue;
    const label = typeof threat === 'string' ? threat : threat.label;
    const trimmed = label?.trim();
    if (trimmed) result.push(trimmed);
  }
  return result;
}

const PROVIDER = 'Net.Coffee';

function geoEntries(data: CoffeeIp): Geo[] {
  return (data.geo_sources ?? []).map((entry) => ({
    ip: data.ip,
    source: `${PROVIDER} / ${entry.src ?? '—'}`,
    country: entry.country,
    country_code: entry.country_code,
    region: entry.region,
    city: entry.city,
    latitude: typeof entry.lat === 'number' ? entry.lat : undefined,
    longitude: typeof entry.lon === 'number' ? entry.lon : undefined,
  }));
}

export function adaptCoffee(data: CoffeeIp): CoffeeLookup {
  const sources = geoEntries(data);
  const located = sources.find((entry) => entry.latitude != null && entry.longitude != null);
  const flags = {
    vpn: data.is_vpn,
    proxy: data.is_proxy,
    tor: data.is_tor,
    bot_status: data.is_crawler,
    recent_abuse: data.is_abuser,
  };
  return {
    coffee: data,
    sources,
    geo: {
      ip: data.ip,
      country: data.country,
      country_code: data.countryCode,
      region: data.region,
      city: data.city,
      isp: data.isp,
      asn: data.asn,
      latitude: located?.latitude,
      longitude: located?.longitude,
      source: PROVIDER,
    },
    risk: {
      available: Object.values(flags).some((v) => typeof v === 'boolean') || undefined,
      source: PROVIDER,
      ...flags,
    },
  };
}
