import { HttpError, target, upstream } from './http.js';
import catalog from './nodes.json';

const GLOBALPING = 'https://api.globalping.io/v1';
const REGIONS = ['AF', 'AS', 'EU', 'NA', 'OC', 'SA'];
const MAX_PROBES = 50;
const MEASUREMENT_ID = /^[a-zA-Z0-9_-]{8,80}$/;

function regionalLocations(input) {
  const unique = [...new Set(input.regions)];
  const valid =
    Array.isArray(input.regions) &&
    unique.length > 0 &&
    unique.every((region) => REGIONS.includes(region)) &&
    Number.isInteger(input.perRegion) &&
    input.perRegion >= 1 &&
    unique.length * input.perRegion <= MAX_PROBES;
  if (!valid) throw new HttpError(400, '单批请选择有效地区及 1–50 个探针');
  return unique.map((continent) => ({ continent, limit: input.perRegion }));
}

async function nodeLocations(input) {
  if (!Array.isArray(input.nodes) || !input.nodes.length || input.nodes.length > MAX_PROBES) {
    throw new HttpError(400, '单批请选择 1–50 个地区');
  }
  const needsRemote = input.nodes.some((id) => typeof id === 'string' && id.includes(':'));
  const source = needsRemote ? await pingNodes() : catalog;
  const picked = [...new Set(input.nodes)].map((id) => source.find((node) => node.id === id));
  if (picked.some((node) => !node)) throw new HttpError(400, '无效的探测地区');
  return picked.map((node) => ({
    country: node.cc.toUpperCase(),
    city: node.city,
    limit: 1,
    ...(input.preferred === true && node.preferredAsn ? { asn: node.preferredAsn } : {}),
  }));
}

export async function startPing(input) {
  if (input.protocol !== undefined && !['icmp', 'https'].includes(input.protocol)) {
    throw new HttpError(400, '不支持此测量协议');
  }
  const locations = input.regions ? regionalLocations(input) : await nodeLocations(input);
  const httpsMode = input.protocol === 'https';
  // Actual probe availability is decided by Globalping, never fabricate fixed nodes.
  return upstream(`${GLOBALPING}/measurements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: httpsMode ? 'http' : 'ping',
      target: target(input.host),
      measurementOptions: httpsMode
        ? { protocol: 'HTTPS', port: 443, request: { method: 'HEAD', path: '/' } }
        : { packets: 3 },
      locations,
      inProgressUpdates: true,
    }),
  });
}

export async function pingResult(id) {
  if (!MEASUREMENT_ID.test(id)) throw new HttpError(400, '无效的测量 ID');
  return upstream(`${GLOBALPING}/measurements/${id}`, {
    headers: { 'Content-Type': 'application/json' },
  });
}

const CLOUD_NETWORKS =
  /amazon|google|microsoft|digitalocean|ovh|hetzner|akamai|linode|vultr|choopa|oracle|alibaba|aliyun|tencent|huawei/i;
const CN_CARRIERS =
  /chinanet|china telecom|china unicom|china mobile|cmnet|china networks inter-exchange/i;

export async function pingNodes() {
  const probes = await upstream(
    `${GLOBALPING}/probes`,
    { cf: { cacheTtl: 300, cacheEverything: true } },
    8_000_000
  );

  const cities = new Map();
  const carriers = new Map();
  for (const probe of probes) {
    const location = probe.location;
    if (!location?.country || !location.city) continue;

    const id = `${location.country}:${location.city}`;
    const networkOk =
      Number.isInteger(location.asn) &&
      typeof location.network === 'string' &&
      (location.country === 'CN' ? CN_CARRIERS : CLOUD_NETWORKS).test(location.network);
    if (networkOk) {
      const key = `${id}:${location.asn}`;
      const entry = carriers.get(key) ?? {
        cityId: id,
        asn: location.asn,
        network: location.network,
        count: 0,
      };
      entry.count++;
      carriers.set(key, entry);
    }

    const city = cities.get(id);
    if (city) {
      city.probes++;
    } else {
      cities.set(id, {
        id,
        cc: location.country.toLowerCase(),
        continent: location.continent,
        city: location.city,
        name: location.country,
        probes: 1,
      });
    }
  }

  for (const carrier of carriers.values()) {
    const city = cities.get(carrier.cityId);
    const better =
      !city.preferredAsn ||
      carrier.count > city.preferredProbes ||
      (carrier.count === city.preferredProbes && carrier.asn < city.preferredAsn);
    if (better) {
      city.preferredAsn = carrier.asn;
      city.preferredNetwork = carrier.network;
      city.preferredProbes = carrier.count;
    }
  }

  return [...cities.values()].sort(
    (a, b) => a.cc.localeCompare(b.cc) || a.city.localeCompare(b.city)
  );
}
