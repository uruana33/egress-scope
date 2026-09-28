import type { DnsHttpExit, DnsTreePath } from '@/views/egress/dns-lanes';
import { dnsHttpPath } from '@/views/egress/dns-lanes';

import type { EgressLaneKind } from './lanes';

export type CdnHit = {
  id: string;
  name: string;
  family: string;
  familyLabel: string;
  path: DnsTreePath;
  website: string;
  url: string;
  node?: string;
  cache?: string;
  loading: boolean;
  error?: string;
};

export type CdnLane = {
  key: string;
  kind: EgressLaneKind;
  path: DnsTreePath;
  family: string;
  familyLabel: string;
  website: string;
  samples: number;
  members: CdnHit[];
};

export type CdnLaneGroup = {
  key: 'colo' | 'wait' | 'miss';
  label: string;
  members: CdnHit[];
};

export type CdnForestTree = {
  key: DnsTreePath | 'all';
  origin?: DnsHttpExit;
  hint: string;
  lanes: CdnLane[];
};

export type CdnHitState = 'success' | 'failed' | 'pending';

export type CdnHitSummary = {
  ready: CdnHit[];
  failed: CdnHit[];
  pending: CdnHit[];
  done: CdnHit[];
  successfulFamilies: string[];
};

export function cdnHitState(hit: Pick<CdnHit, 'node' | 'loading' | 'error'>): CdnHitState {
  if (hit.loading) return 'pending';
  if (hit.error?.trim()) return 'failed';
  return hit.node ? 'success' : 'failed';
}

export function summarizeCdnHits(hits: readonly CdnHit[]): CdnHitSummary {
  const ready: CdnHit[] = [];
  const failed: CdnHit[] = [];
  const pending: CdnHit[] = [];
  const done: CdnHit[] = [];
  const successfulFamilies = new Set<string>();

  for (const hit of hits) {
    const state = cdnHitState(hit);
    if (state === 'success') {
      ready.push(hit);
      done.push(hit);
      successfulFamilies.add(hit.family);
    } else if (state === 'pending') {
      pending.push(hit);
    } else {
      failed.push(hit);
      done.push(hit);
    }
  }

  return {
    ready,
    failed,
    pending,
    done,
    successfulFamilies: [...successfulFamilies],
  };
}

function clip(value: string, max = 14) {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 1))}…`;
}

function headerValue(chunk: string) {
  return chunk.replace(/^[\w-]+:\s*/, '').trim();
}

export function looksLikeIp(value: string) {
  const text = value.trim();
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(text)) return true;
  return (
    text.includes(':') &&
    /^[0-9a-f:]+$/i.test(text) &&
    text.length >= 8 &&
    (text.match(/:/g) ?? []).length >= 2
  );
}

export function cdnLeafKind(label: string): 'ip' | 'text' {
  return looksLikeIp(label) ? 'ip' : 'text';
}

export function cdnNodeLabel(node: string, max = 14) {
  const raw = node.trim();
  if (!raw) return '';
  const bunny = raw.match(/bunnycdn-([\w.-]+)/i)?.[1];
  if (bunny) return clip(bunny.length <= 4 ? bunny.toUpperCase() : bunny, max);
  const colo = raw.match(/(?:^|\n)colo=(.+)$/m)?.[1]?.trim();
  if (colo) return clip(colo, max);
  const cacheToken = raw.match(/cache-[\w.-]+/i)?.[0] ?? '';
  const cacheIata = cacheToken.match(/-([A-Z]{3})$/i)?.[1];
  if (cacheIata) return cacheIata.toUpperCase();
  const cacheCity = raw.match(/cache-([a-z]{3})(?=-|\d|$)/i)?.[1];
  if (cacheCity) return cacheCity.toUpperCase();
  const cloudfront = raw.match(/\b([A-Z]{3}\d{2}(?:-P\d+)?)\b/);
  if (cloudfront) return cloudfront[1];
  const zenlayer = raw.match(/\b[A-Z]{2}\.([A-Z]{3})\.\d+/);
  if (zenlayer) return zenlayer[1];
  const wangsu = raw.match(/\bPS-([A-Z]{3})[-_]/i)?.[1];
  if (wangsu) return wangsu.toUpperCase();
  const region = raw.match(/\b([a-z]{2}-[a-z]+-\d)\b/);
  if (region) return region[1];
  const cacheHost = raw.match(/cache\d+\.([a-z0-9-]+)/i)?.[1];
  if (cacheHost) return clip(cacheHost.replace(/-cu.*$/i, ''), max);
  const cachefly = raw.match(/\b([a-z]{3}\d)\b/i)?.[1];
  if (cachefly && /sjc|lax|iad|fra|hkg|sin|nrt|ams|sfo|ord/i.test(cachefly))
    return cachefly.toLowerCase();
  if (raw.includes('|')) {
    const parts = raw
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean);
    const edge = [...parts].reverse().find((part) => looksLikeIp(part));
    if (edge) return clip(edge, max);
  }
  const chunks = raw
    .split(/\s*·\s*/)
    .map(headerValue)
    .filter(Boolean);
  const pick = chunks.at(-1) ?? raw;
  if (looksLikeIp(pick)) return clip(pick, max);
  const iata = pick.match(/(?:^|[\s._/-])([A-Z]{3})(?:[\s._/-]|$)/)?.[1];
  if (iata && !['TCP', 'HIT', 'VIA', 'HTTP'].includes(iata)) return iata;
  return clip(pick, max);
}

export function cdnLaneKey(path: DnsTreePath, family: string) {
  return `${path}:${family}`;
}

export function groupCdnLanes(hits: readonly CdnHit[]): CdnLane[] {
  const buckets = new Map<string, CdnHit[]>();
  for (const hit of hits) {
    const key = cdnLaneKey(hit.path, hit.family);
    const list = buckets.get(key) ?? [];
    list.push(hit);
    buckets.set(key, list);
  }
  const lanes = [...buckets.entries()].map(([key, members]) => {
    const featured = members[0];
    const ok = members.filter((item) => cdnHitState(item) === 'success');
    const pending = members.some((item) => cdnHitState(item) === 'pending');
    const kind: EgressLaneKind = ok.length ? 'exit' : pending ? 'pending' : 'blocked';
    return {
      key,
      kind,
      path: featured.path,
      family: featured.family,
      familyLabel: featured.familyLabel,
      website: featured.website,
      samples: ok.length,
      members,
    };
  });
  const rank = (lane: CdnLane) => (lane.kind === 'exit' ? 0 : lane.kind === 'pending' ? 1 : 2);
  lanes.sort(
    (left, right) =>
      rank(left) - rank(right) ||
      right.samples - left.samples ||
      left.familyLabel.localeCompare(right.familyLabel)
  );
  return lanes;
}

export function cdnLaneGroups(lane: CdnLane): CdnLaneGroup[] {
  const colo = lane.members.filter((item) => cdnHitState(item) === 'success');
  const wait = lane.members.filter((item) => cdnHitState(item) === 'pending');
  const miss = lane.members.filter((item) => cdnHitState(item) === 'failed');
  const groups: CdnLaneGroup[] = [];
  if (colo.length) groups.push({ key: 'colo', label: '边缘节点', members: colo });
  if (wait.length) groups.push({ key: 'wait', label: '探测中', members: wait });
  if (miss.length) groups.push({ key: 'miss', label: '受阻', members: miss });
  if (!groups.length) {
    groups.push({ key: 'wait', label: '探测中', members: lane.members });
  }
  return groups;
}

export function cdnMemberId(laneKey: string, groupKey: string, id: string) {
  return `${laneKey}::${groupKey}::${id}`;
}

export function parseCdnLeafId(id: string) {
  const [laneKey, groupKey, ...rest] = id.split('::');
  const memberId = rest.join('::');
  if (!laneKey || !groupKey || !memberId) return;
  return { laneKey, groupKey, id: memberId };
}

function pendingLane(path: DnsTreePath): CdnLane {
  return {
    key: `pending:${path}`,
    kind: 'pending',
    path,
    family: 'pending',
    familyLabel: '检测中',
    website: '',
    samples: 0,
    members: [],
  };
}

function withPending(lanes: CdnLane[], path: DnsTreePath, busy: boolean) {
  if (lanes.some((lane) => lane.kind === 'exit' || lane.kind === 'pending')) {
    return lanes;
  }
  if (busy) return [...lanes, pendingLane(path)];
  return lanes;
}

export function splitCdnForest(
  lanes: CdnLane[],
  httpExits: readonly DnsHttpExit[] = [],
  busy = false
): CdnForestTree[] {
  const unique: DnsHttpExit[] = [];
  const seen = new Set<string>();
  for (const exit of httpExits) {
    if (!exit.ip || seen.has(exit.ip)) continue;
    seen.add(exit.ip);
    unique.push({ ...exit, path: dnsHttpPath(exit) });
  }
  const domestic = unique.find((exit) => dnsHttpPath(exit) === 'domestic');
  const overseas = unique.find((exit) => dnsHttpPath(exit) === 'overseas');
  if (!domestic || !overseas) {
    return [
      {
        key: 'all',
        origin: unique[0],
        hint: unique[0]?.ip ? 'CDN 来源分组' : 'CDN 来源分组待读取',
        lanes,
      },
    ];
  }
  return [
    {
      key: 'domestic',
      origin: domestic,
      hint: 'CDN 来源分组 · 国内',
      lanes: withPending(
        lanes.filter((lane) => lane.path === 'domestic'),
        'domestic',
        busy
      ),
    },
    {
      key: 'overseas',
      origin: overseas,
      hint: 'CDN 来源分组 · 海外',
      lanes: withPending(
        lanes.filter((lane) => lane.path === 'overseas'),
        'overseas',
        busy
      ),
    },
  ];
}
