import type { PingNode } from '../ping/api';

export const latencyCountries = ['us', 'de', 'gb', 'fr', 'jp', 'ca', 'cn', 'kr'] as const;

function probeWeight(node: PingNode) {
  return node.preferredProbes ?? 0;
}

export function selectLatencyNodes(nodes: PingNode[]) {
  const eligible = nodes
    .filter((node) => node.preferredAsn)
    .sort((a, b) => probeWeight(b) - probeWeight(a) || a.id.localeCompare(b.id));
  const best = new Map<string, PingNode>();
  for (const node of eligible) {
    if (!best.has(node.cc)) best.set(node.cc, node);
  }
  return latencyCountries.map((cc) => ({ cc, node: best.get(cc) }));
}
