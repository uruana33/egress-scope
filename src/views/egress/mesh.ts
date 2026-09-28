import type { EgressLaneKind } from './lanes';

export type MeshPoint = { x: number; y: number };

export type MeshLinkRole = 'trunk' | 'tail';

export interface MeshLink {
  key: string;
  d: string;
  kind: EgressLaneKind;
  role: MeshLinkRole;
  tone: string;
  laneIndex: number;
  packets: 0 | 1 | 2;
}

export interface MeshLaneInput {
  key: string;
  kind: EgressLaneKind;
  tone: string;
  packets: 0 | 1 | 2;
  laneIndex: number;
  /** Top-center of the IP card — fork attaches here. */
  entry: MeshPoint;
  /** Bottom-center of the IP card — leaf stems start here. */
  dock: MeshPoint;
  /** Top-center of each site group hanging off this exit. */
  leaves: MeshPoint[];
}

function fmt(value: number) {
  return value.toFixed(1);
}

const COLINEAR = 1;

/** Orthogonal fork: down from the hub, across a shared bus, down onto the card. */
export function treeFork(origin: MeshPoint, entry: MeshPoint, busY: number): string {
  if (Math.abs(entry.x - origin.x) < COLINEAR)
    return `M ${fmt(origin.x)} ${fmt(origin.y)} L ${fmt(origin.x)} ${fmt(entry.y)}`;
  return `M ${fmt(origin.x)} ${fmt(origin.y)} L ${fmt(origin.x)} ${fmt(busY)} L ${fmt(entry.x)} ${fmt(busY)} L ${fmt(entry.x)} ${fmt(entry.y)}`;
}

/** Orthogonal stem from the IP card down onto its site cluster. */
export function treeStem(from: MeshPoint, to: MeshPoint): string {
  if (Math.abs(from.x - to.x) < COLINEAR)
    return `M ${fmt(from.x)} ${fmt(from.y)} L ${fmt(from.x)} ${fmt(to.y)}`;
  const midY = from.y + (to.y - from.y) * 0.5;
  return `M ${fmt(from.x)} ${fmt(from.y)} L ${fmt(from.x)} ${fmt(midY)} L ${fmt(to.x)} ${fmt(midY)} L ${fmt(to.x)} ${fmt(to.y)}`;
}

export function treeBusY(origin: MeshPoint, entries: readonly MeshPoint[]) {
  const nearest = entries.reduce((min, point) => Math.min(min, point.y), Number.POSITIVE_INFINITY);
  if (!Number.isFinite(nearest)) return origin.y + 28;
  const gap = Math.max(0, nearest - origin.y);
  return origin.y + Math.max(20, Math.min(40, gap * 0.5));
}

/** Bus between an IP card and the nearest group hanging off it. */
export function leafBusY(dock: MeshPoint, leaves: readonly MeshPoint[]) {
  const nearest = leaves.reduce((min, point) => Math.min(min, point.y), Number.POSITIVE_INFINITY);
  if (!Number.isFinite(nearest)) return dock.y + 18;
  const gap = Math.max(0, nearest - dock.y);
  return dock.y + Math.max(12, Math.min(22, gap * 0.4));
}

/**
 * Hub → IP cards on a shared bus, then each card → its site groups.
 * Exits are never linked to each other.
 */
export function buildMeshLinks(input: {
  origin: MeshPoint;
  lanes: readonly MeshLaneInput[];
}): MeshLink[] {
  const busY = treeBusY(
    input.origin,
    input.lanes.map((lane) => lane.entry)
  );
  return input.lanes.flatMap((lane) => {
    const base = {
      kind: lane.kind,
      tone: lane.tone,
      laneIndex: lane.laneIndex,
    };
    const trunk = {
      ...base,
      key: `${lane.key}:trunk`,
      role: 'trunk' as const,
      packets: lane.packets,
      d: treeFork(input.origin, lane.entry, busY),
    };
    if (!lane.leaves.length) return [trunk];
    const twigBus = leafBusY(lane.dock, lane.leaves);
    const tails = lane.leaves.map((leaf, index) => ({
      ...base,
      key: `${lane.key}:tail:${index}`,
      role: 'tail' as const,
      packets: (lane.packets > 0 && index < 2 ? 1 : 0) as 0 | 1 | 2,
      d: lane.leaves.length === 1 ? treeStem(lane.dock, leaf) : treeFork(lane.dock, leaf, twigBus),
    }));
    return [trunk, ...tails];
  });
}
