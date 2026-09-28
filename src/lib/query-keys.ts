type QueryKey = readonly unknown[];

/**
 * Bump registry when a source's endpoint or selection changes. Bump parser when
 * source normalization or response parsing changes. Keeping both values in
 * diagnostic keys prevents an in-memory query from crossing a contract change.
 */
export const DIAGNOSTIC_REGISTRY_VERSION = 'home-sources-v3' as const;
export const DIAGNOSTIC_PARSER_VERSION = 'source-parser-v1' as const;
export const diagnosticQueryVersions = {
  registry: DIAGNOSTIC_REGISTRY_VERSION,
  parser: DIAGNOSTIC_PARSER_VERSION,
} as const;

export const queryKeys = {
  geo: {
    byIp: (ip: string | undefined) => ['geo', ip] as const,
  },
  egress: {
    domestic: (version = 3) => ['egress', 'domestic-ip', version] as const,
    cloudflare: () => ['egress', 'cloudflare'] as const,
  },
  ai: {
    exit: (platformId: string) => ['ai-exit', platformId] as const,
    defaultExit: () => ['ai-default-exit', 'v2'] as const,
    network: (domains: readonly string[]) => ['ai-network', 'v3', ...domains] as const,
    preview: (platformId: string) => ['ai-preview', 'v3', platformId] as const,
  },
  home: {
    browserIp: (version = 4) => ['browser-ip', version] as const,
    split: (sourceId: string, round: number) =>
      [
        'split',
        diagnosticQueryVersions.registry,
        diagnosticQueryVersions.parser,
        sourceId,
        round,
      ] as const,
  },
  ip: {
    classification: (ip: string) => ['lookup-ip-coffee', ip] as const,
    cross: (ip: string) => ['lookup-ip-cross', ip] as const,
    /**
     * A latency run belongs to the address it measured, so the result is
     * cached per IP and survives tab switches and back navigation.
     */
    latency: (ip: string) => ['ip-latency', ip] as const,
  },
  ping: {
    /**
     * The probe catalog is a property of the service, not of the address being
     * tested, so the ping page and the latency widget share one cache entry.
     */
    catalog: () => ['ping-node-catalog-v3'] as const,
  },
  status: {
    service: (serviceId: string) => ['service-status', serviceId] as const,
  },
} as const;

export const homeRefreshPrefixes = [
  'browser-ip',
  'split',
  'geo',
  'lookup-ip-coffee',
  'lookup-ip-cross',
  'ai-preview',
  'service-status',
  'webrtc-diagnostic',
  'home-browser-fingerprint',
  'egress',
] as const;

const homeRefreshPrefixSet: ReadonlySet<string> = new Set(homeRefreshPrefixes);

export function isHomeQueryKey(queryKey: QueryKey) {
  return homeRefreshPrefixSet.has(String(queryKey[0]));
}
