import { readFile, writeFile } from 'node:fs/promises';
import { isIP } from 'node:net';

// Explicit opt-in live collection. The offline evaluator never calls this.
const args = process.argv.slice(2);
const options = {
  labels: 'scripts/ip-quality-data/labels.json',
  out: 'scripts/ip-quality-data/samples.json',
  base: 'http://127.0.0.1:5137',
  extra: '124.126.3.108,74.120.253.118',
};
for (let i = 0; i < args.length; i += 2) {
  const key = args[i].replace(/^--/, '');
  if (!(key in options) || !args[i + 1]) throw new Error(`Invalid argument ${args[i]}`);
  options[key] = args[i + 1];
}
const labels = JSON.parse(await readFile(options.labels, 'utf8'));
const addresses = [
  ...new Set([...labels.labels.map((row) => row.ip), ...options.extra.split(',').filter(Boolean)]),
];
if (addresses.length > 12 || addresses.some((ip) => !isIP(ip)))
  throw new Error('Collect at most 12 valid, explicit IP addresses per run');
const base = new URL(options.base);
if (base.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname))
  throw new Error('Cross-provider collection must use a local development server');
const fields = [
  'ip',
  'trust_score',
  'abuser_score',
  'intelligence',
  'is_bogon',
  'is_datacenter',
  'isResidential',
  'is_vpn',
  'is_proxy',
  'is_tor',
  'is_crawler',
  'is_abuser',
  'is_mobile',
  'is_public_service',
  'public_service',
  'company_type',
  'company_name',
  'asn_kind',
  'isp',
  'asOrganization',
  'asn',
  'asname',
  'countryCode',
  'registered_country_code',
  'country',
  'registered_country',
];
async function fetchJson(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(25000) });
    if (!response.ok)
      return {
        data: null,
        meta: { url, ok: false, error: `HTTP ${response.status}` },
      };
    const text = await response.text();
    if (text.length > 1000000) throw new Error('Oversized response');
    return { data: JSON.parse(text), meta: { url, ok: true } };
  } catch (error) {
    return {
      data: null,
      meta: { url, ok: false, error: error.name ?? 'RequestError' },
    };
  }
}
let samples = [];
try {
  const previous = JSON.parse(await readFile(options.out, 'utf8'));
  if (previous?.schemaVersion === 1 && Array.isArray(previous.samples)) samples = previous.samples;
} catch {
  // A fresh output path is the normal case.
}
const runStartedAt = new Date().toISOString();
const usedIds = new Set(samples.map((sample) => sample.id));
// Sequential IPs keep the existing upstream adapters' request fan-out bounded.
for (const [index, ip] of addresses.entries()) {
  const collectedAt = new Date().toISOString();
  const baseId = `${ip.replaceAll(':', '_')}-${runStartedAt
    .replaceAll(/[^0-9]/g, '')
    .slice(0, 14)}-${index + 1}`;
  let id = baseId;
  let suffix = 2;
  while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
  usedIds.add(id);
  const [coffee, cross] = await Promise.all([
    fetchJson(`https://ip.net.coffee/api/ip/lookup/${encodeURIComponent(ip)}`),
    fetchJson(new URL(`/api/ip/cross/${encodeURIComponent(ip)}`, base).href),
  ]);
  samples.push({
    id,
    ip,
    collectedAt,
    coffee: coffee.data
      ? Object.fromEntries(
          fields
            .filter((key) => Object.hasOwn(coffee.data, key))
            .map((key) => [key, coffee.data[key]])
        )
      : null,
    cross: cross.data
      ? {
          ip: cross.data.ip,
          readings: cross.data.readings,
          unavailable: cross.data.unavailable,
          checkedAt: cross.data.checkedAt,
          prefix: cross.data.prefix,
        }
      : null,
    acquisition: { coffee: coffee.meta, cross: cross.meta },
  });
  await writeFile(options.out, JSON.stringify({ schemaVersion: 1, samples }, null, 2) + '\n');
  console.log(`${ip}: coffee=${coffee.meta.ok}, cross=${cross.meta.ok}`);
}
