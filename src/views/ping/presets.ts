import type { PingNode } from './api';

const CONTINENTS = ['AS', 'EU', 'NA', 'SA', 'AF', 'OC'];

const betterFirst = (a: PingNode, b: PingNode) =>
  Number(Boolean(b.preferredAsn)) - Number(Boolean(a.preferredAsn)) ||
  (b.preferredProbes ?? b.probes ?? 0) - (a.preferredProbes ?? a.probes ?? 0) ||
  a.id.localeCompare(b.id);

export function selectPingPresets(nodes: PingNode[], scope: string, fullCoverage: boolean) {
  const perCountry = new Map<string, PingNode>();
  for (const node of nodes) {
    const current = perCountry.get(node.cc);
    if (!current || betterFirst(node, current) < 0) perCountry.set(node.cc, node);
  }

  const inScope = [...perCountry.values()].filter(
    (node) => scope === 'world' || node.continent === scope
  );
  const chinaNodes = nodes
    .filter((node) => node.cc === 'cn')
    .sort(betterFirst)
    .slice(0, 2);

  const presetNodes = fullCoverage
    ? inScope
    : [
        ...chinaNodes,
        ...CONTINENTS.flatMap((continent) =>
          inScope
            .filter((node) => node.cc !== 'cn' && node.continent === continent)
            .sort(betterFirst)
            .slice(0, scope === 'world' ? 2 : 5)
        ),
      ];

  return { chinaNodes, availableNodes: inScope, presetNodes };
}
