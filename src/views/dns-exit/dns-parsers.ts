import { normalizePublicIp } from '@/lib/diagnostics';

export type DnsResolver = {
  ip: string;
  geo: string;
  country_code?: string;
};

const isoCountry = (value: unknown): string | undefined =>
  typeof value === 'string' && /^[a-z]{2}$/i.test(value.trim())
    ? value.trim().toUpperCase()
    : undefined;

const normalizedResolverIp = (value: unknown) =>
  typeof value === 'string' ? normalizePublicIp(value)?.ip : undefined;

function dedupeResolvers(resolvers: readonly DnsResolver[]) {
  const found = new Map<string, DnsResolver>();
  for (const resolver of resolvers) {
    const previous = found.get(resolver.ip);
    if (!previous) {
      found.set(resolver.ip, resolver);
      continue;
    }
    if (!previous.country_code && resolver.country_code)
      previous.country_code = resolver.country_code;
    if (resolver.geo.length > previous.geo.length) previous.geo = resolver.geo;
  }
  return [...found.values()];
}

export function parseFastlyEndpoint(
  info: Record<string, unknown> | undefined
): DnsResolver | undefined {
  const ip = normalizedResolverIp(info?.ip);
  if (!info || !ip) return;
  const country_code = isoCountry(info.cc);
  return {
    ip,
    geo: [info.cc, info.as_name].filter((v) => typeof v === 'string').join(' · '),
    ...(country_code ? { country_code } : {}),
  };
}

export const NSTOOL_GLOBALS = [
  'ip',
  'dns',
  'ip_province',
  'ip_city',
  'ip_isp',
  'dns_province',
  'dns_city',
  'dns_isp',
  'res',
  'msg',
] as const;

const NSTOOL_REGION_CODES: Record<string, string> = {
  '^(?:美国|美國|usa?|united states)$': 'US',
  '^(?:日本|japan|jp)$': 'JP',
  '^(?:韩国|韓國|south korea|korea|kr)$': 'KR',
  '^(?:新加坡|singapore|sg)$': 'SG',
  '^(?:英国|英國|united kingdom|great britain|uk|gb)$': 'GB',
  '^(?:德国|德國|germany|de)$': 'DE',
  '^(?:法国|法國|france|fr)$': 'FR',
  '^(?:加拿大|canada|ca)$': 'CA',
  '^(?:澳大利亚|澳洲|australia|au)$': 'AU',
  '^(?:俄罗斯|俄羅斯|russia|ru)$': 'RU',
  '^(?:荷兰|荷蘭|netherlands|nl)$': 'NL',
  '^(?:爱尔兰|愛爾蘭|ireland|ie)$': 'IE',
  '^(?:印度|india|in)$': 'IN',
  '^(?:中国|中國|china|cn)$': 'CN',
};

const NSTOOL_REGION_TABLE = Object.entries(NSTOOL_REGION_CODES).map(([pattern, code]) => ({
  pattern: new RegExp(pattern, 'i'),
  code,
}));

const CHINA_SPECIAL: [RegExp, string][] = [
  [/^(?:香港|香港特别行政区|香港特別行政區)$/i, 'HK'],
  [/^(?:台湾|台灣|台湾省|台灣省)$/i, 'TW'],
  [/^(?:澳门|澳門|澳门特别行政区|澳門特別行政區)$/i, 'MO'],
];

const MAINLAND_LOCATION =
  /^(?:中国大陆|中國大陸|大陆|大陸|北京市?|天津市?|上海市?|重庆市?|河北省?|山西省?|辽宁省?|遼寧省?|吉林省?|黑龙江省?|黑龍江省?|江苏省?|江蘇省?|浙江省?|安徽省?|福建省?|江西省?|山东省?|山東省?|河南省?|湖北省?|湖南省?|广东省?|廣東省?|海南省?|四川省?|贵州省?|貴州省?|云南省?|雲南省?|陕西省?|陝西省?|甘肃省?|甘肅省?|青海省?|内蒙古(?:自治区)?|內蒙古(?:自治區)?|广西(?:壮族自治区)?|廣西(?:壯族自治區)?|西藏(?:自治区)?|西藏(?:自治區)?|宁夏(?:回族自治区)?|寧夏(?:回族自治區)?|新疆(?:维吾尔自治区)?|新疆(?:維吾爾自治區)?)$/;

function nstoolCountry(...values: unknown[]) {
  for (const value of values) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) continue;
    const special = CHINA_SPECIAL.find(([pattern]) => pattern.test(text));
    if (special) return special[1];
    const region = NSTOOL_REGION_TABLE.find((item) => item.pattern.test(text));
    if (region) return region.code;
    if (MAINLAND_LOCATION.test(text)) return 'CN';
  }
  return undefined;
}

function nstoolGeo(province: unknown, city: unknown, isp: unknown) {
  const parts = [province, city, isp]
    .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
    .map((value) => value.trim());
  return [...new Set(parts)].join(' · ');
}

function nstoolEndpoint(
  ip: unknown,
  province: unknown,
  city: unknown,
  isp: unknown
): DnsResolver | undefined {
  const normalized = normalizePublicIp(ip);
  if (!normalized) return;
  const country_code = nstoolCountry(province, city);
  const place = nstoolGeo(province, city, isp);
  return {
    ip: normalized.ip,
    geo: [country_code, place].filter(Boolean).join(' · '),
    ...(country_code ? { country_code } : {}),
  };
}

export function parseNstoolVars(data: unknown): {
  resolvers: DnsResolver[];
  client?: DnsResolver;
} {
  if (!data || typeof data !== 'object') return { resolvers: [] };
  const record = data as Record<string, unknown>;
  const resolver = nstoolEndpoint(record.dns, record.dns_province, record.dns_city, record.dns_isp);
  return {
    resolvers: resolver ? [resolver] : [],
    client: nstoolEndpoint(record.ip, record.ip_province, record.ip_city, record.ip_isp),
  };
}

function parseBrowserLeaks(rawIp: string, value: unknown): DnsResolver[] {
  const ip = normalizedResolverIp(rawIp);
  if (!ip || !Array.isArray(value)) return [];
  const country_code = isoCountry(value[0]);
  return [
    {
      ip,
      geo: value
        .slice(1)
        .filter((v) => typeof v === 'string')
        .join(' · '),
      ...(country_code ? { country_code } : {}),
    },
  ];
}

function parseSurfshark(rawIp: string, value: unknown): DnsResolver[] {
  const ip = normalizedResolverIp(rawIp);
  if (!ip || !value || typeof value !== 'object') return [];
  const info = value as Record<string, unknown>;
  const country_code = isoCountry(info.CountryCode ?? info.country_code);
  return [
    {
      ip,
      geo: [info.Country, info.City, info.ISP].filter((v) => typeof v === 'string').join(' · '),
      ...(country_code ? { country_code } : {}),
    },
  ];
}

export function parseDnsResponse(source: string, data: unknown): DnsResolver[] {
  if (source === 'NetEase') return parseNstoolVars(data).resolvers;
  if (!data || typeof data !== 'object') return [];
  const record = data as Record<string, unknown>;
  if (source === 'Fastly') {
    const resolver = parseFastlyEndpoint(
      record.dns_resolver_info as Record<string, unknown> | undefined
    );
    return resolver ? [resolver] : [];
  }
  const resolvers = Object.entries(record).flatMap(([rawIp, value]) => {
    if (source.startsWith('BrowserLeaks')) return parseBrowserLeaks(rawIp, value);
    if (source === 'Surfshark') return parseSurfshark(rawIp, value);
    return [];
  });
  return dedupeResolvers(resolvers);
}

/** HTTP client address echoed by a DNS probe. Not a resolver. */
export function parseDnsClient(source: string, data: unknown): DnsResolver | undefined {
  if (source === 'NetEase') return parseNstoolVars(data).client;
  if (source !== 'Fastly' || !data || typeof data !== 'object') return;
  return parseFastlyEndpoint(
    (data as Record<string, unknown>).client_ip_info as Record<string, unknown> | undefined
  );
}
