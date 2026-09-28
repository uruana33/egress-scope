import { endpoint } from '@/lib/network';

interface RdapEntity {
  handle?: string;
  roles?: string[];
  vcardArray?: [string, unknown[][]];
}

interface RdapData {
  ldhName?: string;
  name?: string;
  handle?: string;
  objectClassName?: string;
  country?: string;
  startAddress?: string;
  endAddress?: string;
  status?: string[];
  events?: { eventAction: string; eventDate: string }[];
  nameservers?: { ldhName?: string }[];
  entities?: RdapEntity[];
  notices?: { title?: string; description?: string[] }[];
}

export interface Registration {
  source: string;
  query: string;
  data: RdapData;
}

export function lookupWhois(query: string, signal: AbortSignal) {
  return endpoint<Registration>(`/whois/lookup/${encodeURIComponent(query)}`, { signal });
}
