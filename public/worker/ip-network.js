import { boundedJson } from './http.js';

const RIPE_STAT = 'https://stat.ripe.net/data';
const TIMEOUT_MS = 4000;
const TIER1 = new Set([
  '174',
  '1299',
  '2914',
  '3257',
  '3356',
  '5511',
  '6453',
  '6461',
  '6762',
  '6939',
  '7018',
]);
const LIMIT_ORIGIN = 4;
const LIMIT_DIRECT = 6;
const LIMIT_SECONDARY = 8;
const LIMIT_NAME_LOOKUPS = 20;

async function ripeStat(endpoint, params) {
  const response = await fetch(
    `${RIPE_STAT}/${endpoint}/data.json?${new URLSearchParams(params)}`,
    {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cf: { cacheTtl: 300, cacheEverything: true },
    }
  );
  if (!response.ok) throw new Error('RIPE unavailable');
  const payload = await boundedJson(response);
  if (payload.status !== 'ok' || !payload.data) throw new Error('RIPE unavailable');
  return payload.data;
}

const asNumber = (value) =>
  String(value ?? '')
    .trim()
    .match(/^(?:AS)?(\d+)$/i)?.[1];

const bump = (map, key, amount = 1) => map.set(key, (map.get(key) ?? 0) + amount);

const byCountThenAsn = ([aAsn, aCount], [bAsn, bCount]) =>
  bCount - aCount || aAsn.localeCompare(bAsn, undefined, { numeric: true });

const shareOf = (count, total) => Math.round((count / total) * 1000) / 10;

function topItems(counts, total, limit) {
  return [...counts.entries()]
    .sort(byCountThenAsn)
    .slice(0, limit)
    .map(([asn, count]) => ({ asn, count, share: shareOf(count, total), tier1: TIER1.has(asn) }));
}

function asPath(record) {
  const hops = (Array.isArray(record?.path) ? record.path : []).map(asNumber).filter(Boolean);
  return hops.filter((asn, i) => i === 0 || asn !== hops[i - 1]);
}

function collectTopology(bgpState, prefix, announcedAsns) {
  const records = Array.isArray(bgpState?.bgp_state) ? bgpState.bgp_state : [];
  const exact = records.filter((record) => record?.target_prefix === prefix);
  const paths = (exact.length ? exact : records).map(asPath).filter((hops) => hops.length > 0);
  if (!paths.length) return undefined;

  const announced = new Set(announcedAsns);
  const preferred = announced.size ? paths.filter((hops) => announced.has(hops.at(-1))) : [];
  const usable = preferred.length ? preferred : paths;

  const origins = new Map();
  const tier2 = new Map();
  const tier3 = new Map();
  const edgeOtoD = new Map();
  const edgeDtoS = new Map();
  const viaPerSecondary = new Map();

  for (const hops of usable) {
    const origin = hops.at(-1);
    bump(origins, origin);
    if (hops.length < 2) continue;

    const upstream2 = hops.at(-2);
    if (upstream2 === origin) continue;
    bump(tier2, upstream2);
    bump(edgeOtoD, `${origin}|${upstream2}`);

    if (hops.length < 3) continue;
    const upstream3 = hops.at(-3);
    if (upstream3 === upstream2 || upstream3 === origin) continue;
    bump(tier3, upstream3);
    bump(edgeDtoS, `${upstream2}|${upstream3}`);
    if (!viaPerSecondary.has(upstream3)) viaPerSecondary.set(upstream3, new Map());
    bump(viaPerSecondary.get(upstream3), upstream2);
  }

  if (!tier2.size) return undefined;
  const total = usable.length;
  const originItems = topItems(origins, total, LIMIT_ORIGIN);
  const directItems = topItems(tier2, total, LIMIT_DIRECT);
  const originSet = new Set(originItems.map((item) => item.asn));
  const directSet = new Set(directItems.map((item) => item.asn));

  const visibleSecondary = new Map();
  for (const [edge, count] of edgeDtoS) {
    const [via, upstream3] = edge.split('|');
    if (directSet.has(via)) bump(visibleSecondary, upstream3, count);
  }
  const secondaryItems = topItems(visibleSecondary, total, LIMIT_SECONDARY).map((item) => ({
    ...item,
    via: [...(viaPerSecondary.get(item.asn)?.entries() ?? [])]
      .filter(([via]) => directSet.has(via))
      .sort(byCountThenAsn)
      .map(([via]) => via)
      .slice(0, 3),
  }));
  const secondarySet = new Set(secondaryItems.map((item) => item.asn));

  const edges = [...edgeOtoD.entries()]
    .map(([edge, count]) => {
      const [origin, via] = edge.split('|');
      return { origin, direct: via, count, share: shareOf(count, total) };
    })
    .filter((edge) => originSet.has(edge.origin) && directSet.has(edge.direct));
  const secondaryEdges = [...edgeDtoS.entries()]
    .map(([edge, count]) => {
      const [via, upstream3] = edge.split('|');
      return { direct: via, secondary: upstream3, count, share: shareOf(count, total) };
    })
    .filter((edge) => directSet.has(edge.direct) && secondarySet.has(edge.secondary));

  return {
    observedPaths: total,
    queryTime: bgpState.query_time,
    origins: originItems,
    direct: directItems,
    secondary: secondaryItems,
    edges,
    secondaryEdges,
    lookupAsns: [...originSet, ...directSet, ...secondarySet].slice(0, LIMIT_NAME_LOOKUPS),
  };
}

async function asnHolder(asn) {
  try {
    const data = await ripeStat('as-overview', { resource: `AS${asn}` });
    const holder = typeof data?.holder === 'string' ? data.holder.trim() : '';
    return holder || undefined;
  } catch {
    return undefined;
  }
}

async function attachHolderNames(topology) {
  const entries = await Promise.all(
    topology.lookupAsns.map(async (asn) => [asn, await asnHolder(asn)])
  );
  const names = new Map(entries);
  const decorate = (item) => (names.get(item.asn) ? { ...item, name: names.get(item.asn) } : item);
  const { lookupAsns: _lookupAsns, ...rest } = topology;
  return {
    ...rest,
    origins: topology.origins.map(decorate),
    direct: topology.direct.map(decorate),
    secondary: topology.secondary.map(decorate),
  };
}

export async function ipNetwork(ip) {
  const [network, reverse, bgp] = await Promise.allSettled([
    ripeStat('network-info', { resource: ip }),
    ripeStat('reverse-dns-ip', { resource: ip }),
    ripeStat('bgp-state', { resource: ip }),
  ]);
  const route = network.status === 'fulfilled' ? network.value : undefined;
  const dns = reverse.status === 'fulfilled' ? reverse.value : undefined;
  const asns = Array.isArray(route?.asns) ? route.asns.map(asNumber).filter(Boolean) : [];

  const rawTopology =
    route?.prefix && bgp.status === 'fulfilled'
      ? collectTopology(bgp.value, route.prefix, asns)
      : undefined;

  const rpkiChecks = route?.prefix
    ? Promise.all(
        asns.map(async (asn) => {
          try {
            const data = await ripeStat('rpki-validation', { resource: asn, prefix: route.prefix });
            return { asn, status: data.status, description: data.description };
          } catch {
            return { asn, status: 'unavailable' };
          }
        })
      )
    : Promise.resolve([]);

  const [validations, topology] = await Promise.all([
    rpkiChecks,
    rawTopology ? attachHolderNames(rawTopology) : Promise.resolve(undefined),
  ]);

  return {
    prefix: route?.prefix,
    asns,
    ptr: Array.isArray(dns?.result) ? dns.result.join(' / ') : dns?.result || undefined,
    routeAvailable: Boolean(route),
    ptrAvailable: Boolean(dns && !dns.error),
    validations,
    topology,
    source: 'RIPE RIS / RIPEstat',
    checkedAt: new Date().toISOString(),
  };
}
