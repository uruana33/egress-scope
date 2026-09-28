import { classifyLookup } from './classify.ts';

export type LookupView = 'whois' | 'ping';

/**
 * Canonical address-lookup location. IPs keep `/network/ip/:ip` so existing
 * shared links still look like an address; domains use `?q=`.
 */
export function lookupLocation(query?: string, view?: LookupView) {
  const classified = query?.trim() ? classifyLookup(query) : null;
  const search = new URLSearchParams();
  if (classified?.kind === 'ip') {
    if (view) search.set('view', view);
    return {
      pathname: `/network/ip/${encodeURIComponent(classified.value)}`,
      search: search.toString(),
    };
  }
  if (classified && classified.kind !== 'unknown' && classified.value)
    search.set('q', classified.value);
  else if (query?.trim()) search.set('q', query.trim());
  if (view) search.set('view', view);
  return { pathname: '/network/ip', search: search.toString() };
}

export function lookupHref(query?: string, view?: LookupView) {
  const { pathname, search } = lookupLocation(query, view);
  return search ? `${pathname}?${search}` : pathname;
}
