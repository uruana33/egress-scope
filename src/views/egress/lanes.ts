import type { Geo } from '@/lib/types';

export type EgressLaneKind = 'exit' | 'blocked' | 'pending' | 'idle';

export interface EgressLaneSite {
  id: string;
  name: string;
  icon: string;
  domain?: string;
  url?: string;
  type: string;
  extra?: readonly string[];
}

export interface EgressLane {
  key: string;
  kind: EgressLaneKind;
  ip?: string;
  geo?: Geo;
  sites: EgressLaneSite[];
}

export interface EgressLaneRow {
  id: string;
  name: string;
  icon: string;
  domain?: string;
  url?: string;
  type: string;
  extra?: readonly string[];
  geo?: Geo;
  visible: boolean;
  pending: boolean;
}

const kindOrder: Record<EgressLaneKind, number> = {
  blocked: 0,
  pending: 1,
  exit: 2,
  idle: 3,
};

/** Collapse per-site probes into the public IPs they actually left from. */
export function groupEgressLanes(rows: readonly EgressLaneRow[]): EgressLane[] {
  const lanes = new Map<string, EgressLane>();
  for (const row of rows) {
    const kind: EgressLaneKind = !row.visible
      ? 'idle'
      : row.pending
        ? 'pending'
        : row.geo?.ip
          ? 'exit'
          : 'blocked';
    const key = kind === 'exit' ? row.geo!.ip : kind;
    const site: EgressLaneSite = {
      id: row.id,
      name: row.name,
      icon: row.icon,
      domain: row.domain,
      url: row.url,
      type: row.type,
      extra: row.extra,
    };
    const existing = lanes.get(key);
    if (existing) {
      existing.sites.push(site);
      if (!existing.geo && row.geo) existing.geo = row.geo;
      continue;
    }
    lanes.set(key, {
      key,
      kind,
      ip: kind === 'exit' ? row.geo?.ip : undefined,
      geo: row.geo,
      sites: [site],
    });
  }
  return [...lanes.values()].sort((left, right) => {
    const byKind = kindOrder[left.kind] - kindOrder[right.kind];
    if (byKind) return byKind;
    return right.sites.length - left.sites.length;
  });
}

export function summarizeEgressLanes(lanes: readonly EgressLane[]) {
  const exits = lanes.filter((lane) => lane.kind === 'exit');
  const blocked = lanes.find((lane) => lane.kind === 'blocked');
  const pending = lanes.find((lane) => lane.kind === 'pending');
  const idle = lanes.find((lane) => lane.kind === 'idle');
  return {
    exits,
    exitCount: exits.length,
    blockedCount: blocked?.sites.length ?? 0,
    pendingCount: pending?.sites.length ?? 0,
    idleCount: idle?.sites.length ?? 0,
    readCount: exits.reduce((total, lane) => total + lane.sites.length, 0),
  };
}

const GROUP_ORDER = [
  'domestic',
  'ai',
  'social',
  'crypto',
  'risk',
  'dev',
  'tools',
  'ecommerce',
  'media',
  'static',
  'speed',
  'international',
] as const;

export interface EgressSiteGroup {
  key: string;
  sites: EgressLaneSite[];
}

/** Prefer the catalog extra tag; fall back to domestic / overseas. */
export function siteGroupKey(site: { type: string; extra?: readonly string[] }): string {
  return site.extra?.[0] || (site.type === 'domestic' ? 'domestic' : 'international');
}

export function groupLaneSites(sites: readonly EgressLaneSite[]): EgressSiteGroup[] {
  const buckets = new Map<string, EgressLaneSite[]>();
  for (const site of sites) {
    const key = siteGroupKey(site);
    const list = buckets.get(key);
    if (list) list.push(site);
    else buckets.set(key, [site]);
  }
  const rank = (key: string) => {
    const index = (GROUP_ORDER as readonly string[]).indexOf(key);
    return index === -1 ? GROUP_ORDER.length : index;
  };
  return [...buckets.entries()]
    .sort((left, right) => {
      const byRank = rank(left[0]) - rank(right[0]);
      if (byRank) return byRank;
      return right[1].length - left[1].length;
    })
    .map(([key, grouped]) => ({ key, sites: grouped }));
}
