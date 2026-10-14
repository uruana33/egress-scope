import { isIP } from 'node:net';

import { edgeMemory, remember, rememberEdge } from './edge-memory.js';
import { HttpError, boundedText, json, publicIp } from './http.js';

/**
 * 五门判定 + 品质分档（T0–T3-）。这是本机脚本 ip-quality-report.py
 * 的 Worker 移植版：同样的八路数据源、同样的判定顺序、同样的中文口径。
 * 判定回答的是「这个地址能不能当作一个账号从注册到使用都不换的出口」，
 * 不回答「平台会不会封号」。
 *
 * 数据源：DoH PTR、RIPE Stat、ARIN/RIPE RDAP、IPinfo widget、ipwho.is、
 * ipquery、proxycheck v2、Scamalytics 公开页。全部免 key。
 *
 * 门规，按顺序：
 *   1. 最具体 RDAP 登记是居民 ISP 自有网络。公告 ASN 只能否决/旁证，不能通过。
 *   2. 机房、服务器、VPN、代理、Tor 全部明确为否。
 *   3. 反向域名是该 ISP 自己的固网池名。
 *   4. 与登记对得上的库里至少两家州一致。
 *   5. 地址从订阅到使用能保持不变。一次查询证明不了，蜂窝证据会否决；
 *      stable=1 记为人工确认通过。
 * 欺诈分和「住宅代理=否」只是旁证，不参与门规。
 */

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 10 * 60_000;
// 大半个上游挂掉时只短缓存，让「重新判定」尽快真正重查，而不是连看 10 分钟降级结果。
const CACHE_TTL_DEGRADED_MS = 15_000;
const CACHE_MIN_SOURCES = 5;
const CACHE_VERSION = 'grade-v1';
const DOH_URL = 'https://cloudflare-dns.com/dns-query';

// 最具体登记名要对上的居民固网名单；公告 ASN 不能顶替登记身份。
const FIXED_ISPS = [
  { label: 'Comcast', name: /\b(comcast|xfinity)\b/, rdns: ['comcast.net', 'comcast.com'] },
  {
    label: 'AT&T 固网',
    name: /\b(at and t internet|att internet|sbc internet|bellsouth|pacific bell|ameritech|u verse|southwestern bell|sbcglobal|pacbell|swbell)\b/,
    rdns: [
      'att.net',
      'sbcglobal.net',
      'bellsouth.net',
      'pacbell.net',
      'swbell.net',
      'ameritech.net',
      'prodigy.net',
    ],
  },
  { label: 'Verizon 住宅', name: /\b(fios|verizon online)\b/, rdns: ['verizon.net'] },
  {
    label: 'Spectrum',
    name: /\b(charter|spectrum|brighthouse|time warner cable|road runner)\b/,
    rdns: ['rr.com', 'charter.com', 'spectrum.com', 'twc.com'],
  },
  { label: 'Cox', name: /\bcox\b/, rdns: ['cox.net', 'cox.com'] },
  { label: 'Frontier', name: /\bfrontier\b/, rdns: ['frontiernet.net', 'frontier.com'] },
  {
    label: 'Astound',
    name: /\b(astound|wave broadband|rcn|grande)\b/,
    rdns: ['astound.net', 'wavebroadband.com', 'rcn.com', 'grandecom.com'],
  },
  {
    label: 'Optimum',
    name: /\b(optimum|altice|cablevision|suddenlink)\b/,
    rdns: ['optimum.net', 'optonline.net', 'suddenlink.net'],
  },
  { label: 'Mediacom', name: /\bmediacom\b/, rdns: ['mediacombb.net', 'mchsi.com'] },
  { label: 'Midco', name: /\b(midco|midcontinent)\b/, rdns: ['midco.net'] },
  {
    label: 'WOW',
    name: /\b(wideopenwest|wide open west|wowway)\b/,
    rdns: ['wowway.com', 'wowinternet.com'],
  },
  {
    label: 'Cable One',
    name: /\b(cable one|cableone|sparklight)\b/,
    rdns: ['cableone.net', 'sparklight.net'],
  },
  {
    label: 'Breezeline',
    name: /\b(breezeline|atlantic broadband|atlanticbb)\b/,
    rdns: ['breezeline.net', 'atlanticbb.net'],
  },
  { label: 'TDS', name: /\btds\b/, rdns: ['tds.net'] },
  {
    label: 'Windstream',
    name: /\b(windstream|kinetic)\b/,
    rdns: ['windstream.net', 'kinetic.net'],
  },
  {
    label: 'Consolidated',
    name: /\b(consolidated communications|fairpoint)\b/,
    rdns: ['mycci.net', 'fairpoint.net', 'consolidated.net'],
  },
  { label: 'Ziply', name: /\bziply\b/, rdns: ['ziplyfiber.com'] },
  { label: 'Brightspeed', name: /\bbrightspeed\b/, rdns: [] },
  { label: 'Metronet', name: /\bmetronet\b/, rdns: [] },
  { label: 'Sonic', name: /\bsonic\b/, rdns: ['sonic.net'] },
  {
    label: 'altafiber',
    name: /\b(cincinnati bell|altafiber)\b/,
    rdns: ['fuse.net', 'altafiber.com'],
  },
  { label: 'Hawaiian Telcom', name: /\bhawaiian tel\b/, rdns: ['hawaiiantel.net'] },
  { label: 'Shentel', name: /\bshentel\b/, rdns: ['shentel.net'] },
  {
    label: 'Service Electric',
    name: /\b(service electric|sectv|pentele-data)\b/,
    rdns: ['sectv.com', 'ptd.net'],
  },
  { label: 'Armstrong', name: /\barmstrong\b/, rdns: ['zoominternet.net', 'armstrongonewire.com'] },
  { label: 'EPB', name: /\bepb\b/, rdns: ['epbfi.com'] },
  { label: 'Hargray', name: /\bhargray\b/, rdns: [] },
  { label: 'GCI', name: /\b(gci|alaska communications)\b/, rdns: ['gci.net', 'acsalaska.net'] },
  { label: 'Google Fiber', name: /\b(google fiber|gfiber)\b/, rdns: ['googlefiber.net'] },
  {
    label: 'Quantum Fiber',
    name: /\bquantum fiber\b/,
    rdns: ['qwest.net', 'centurylink.net'],
  },
];

const REJECT_RULES = [
  [/\b(mobil\w*|wireless|cellular|cellco\w*|vzw|t mobile|tmobile|cricket)\b/, '蜂窝网'],
  [/\b(business|uunet)\b/, '企业网'],
  [
    /\b(gtt|cogent|ntt|zayo|level 3|level3|packetexchange|packet exchange|netlab|centurylink|lumen|savvis|choopa|linode|digitalocean|ovh|hetzner|leaseweb|vultr|cloudflare|akamai|fastly|contabo|amazon|google cloud|microsoft azure|datacamp|psychz|hurricane electric|he net|he[.]net|telia|tata|retn)\b/,
    '过境或机房',
  ],
  [/\b(data center|datacenter|hosting|colocation|colo|cloud|vps|server)\b/, '机房'],
];

const DC_WORDS = ['data center', 'datacenter', 'hosting', 'colocation', 'ace data', 'savvis'];

// Quantum Fiber 是 Lumen 的居民产品线：登记里同时出现 quantum fiber 和
// centurylink/lumen 家族词时，家族词不算过境否决；其他过境词照否。
const CL_FAMILY_WORDS = new Set(['centurylink', 'lumen', 'savvis', 'qwest', 'embarq']);
const QUANTUM_RX = /\bquantum fiber\b/i;

function rejectHits(blob, consumerHintBlob = '') {
  const out = [];
  for (const [pattern, kind] of REJECT_RULES) {
    const hits = new Set([...blob.matchAll(new RegExp(pattern.source, 'g'))].map((m) => m[1]));
    if (!hits.size) continue;
    if (
      kind === '过境或机房' &&
      [...hits].every((hit) => CL_FAMILY_WORDS.has(hit)) &&
      QUANTUM_RX.test(consumerHintBlob)
    )
      continue;
    out.push(kind);
  }
  return out;
}

const POOL_RDNS =
  /(pool[-.]|\bdsl[-.]|cable|broadband|dynamic|cust[.-]|hsd\d|lightspeed|[.]res[.-]|(^|[.])c-\d+-\d+-\d+-\d+[.])/i;
const MOBILE_RDNS = /(?:^|[.\-_])(mobile|wireless|mycingular|vzw|cellco)/i;
const BUSINESS_RDNS = /business/i;
const HANDLE_ONLY = /(?:^|[\s._-])(?:mnt|lir|maint|nic)(?:[\s._\d-]|$)/i;

const GENERIC_TOKENS = new Set([
  'llc',
  'inc',
  'ltd',
  'corp',
  'corporation',
  'company',
  'co',
  'group',
  'holdings',
  'holding',
  'net',
  'com',
  'org',
  'isp',
  'as',
  'usa',
  'us',
  'communications',
  'communication',
  'cable',
  'network',
  'networks',
  'services',
  'service',
  'telecom',
  'telecommunications',
  'internet',
  'systems',
  'technologies',
  'technology',
  'enterprises',
  'enterprise',
  'the',
  'and',
  'of',
  'for',
  'america',
  'american',
]);

const PRIVACY_FIELDS = [
  ['IPinfo 机房', 'ipinfo', 'hosting'],
  ['IPinfo VPN', 'ipinfo', 'vpn'],
  ['IPinfo 代理', 'ipinfo', 'proxy'],
  ['IPinfo Tor', 'ipinfo', 'tor'],
  ['ipquery 数据中心', 'ipquery', 'datacenter'],
  ['ipquery VPN', 'ipquery', 'vpn'],
  ['ipquery 代理', 'ipquery', 'proxy'],
  ['ipquery Tor', 'ipquery', 'tor'],
  ['proxycheck 代理', 'proxycheck', 'proxy'],
  ['Scamalytics 服务器', 'scamalytics', 'server'],
  ['Scamalytics VPN', 'scamalytics', 'vpn'],
  ['Scamalytics 机房', 'scamalytics', 'datacenter'],
  ['Scamalytics 公共代理', 'scamalytics', 'public_proxy'],
];

const HOSTILE_PROXY_TYPES = new Set(['hosting', 'vpn', 'tor', 'compromised', 'socks']);

const DC_PRIVACY = new Set([
  'ipinfo:hosting',
  'ipquery:datacenter',
  'scamalytics:datacenter',
  'scamalytics:server',
]);

const STATES = {
  alabama: 'al',
  alaska: 'ak',
  arizona: 'az',
  arkansas: 'ar',
  california: 'ca',
  colorado: 'co',
  connecticut: 'ct',
  delaware: 'de',
  'district of columbia': 'dc',
  florida: 'fl',
  georgia: 'ga',
  hawaii: 'hi',
  idaho: 'id',
  illinois: 'il',
  indiana: 'in',
  iowa: 'ia',
  kansas: 'ks',
  kentucky: 'ky',
  louisiana: 'la',
  maine: 'me',
  maryland: 'md',
  massachusetts: 'ma',
  michigan: 'mi',
  minnesota: 'mn',
  mississippi: 'ms',
  missouri: 'mo',
  montana: 'mt',
  nebraska: 'ne',
  nevada: 'nv',
  'new hampshire': 'nh',
  'new jersey': 'nj',
  'new mexico': 'nm',
  'new york': 'ny',
  'north carolina': 'nc',
  'north dakota': 'nd',
  ohio: 'oh',
  oklahoma: 'ok',
  oregon: 'or',
  pennsylvania: 'pa',
  'rhode island': 'ri',
  'south carolina': 'sc',
  'south dakota': 'sd',
  tennessee: 'tn',
  texas: 'tx',
  utah: 'ut',
  vermont: 'vt',
  virginia: 'va',
  washington: 'wa',
  'west virginia': 'wv',
  wisconsin: 'wi',
  wyoming: 'wy',
};
for (const code of [
  'al',
  'ak',
  'az',
  'ar',
  'ca',
  'co',
  'ct',
  'de',
  'dc',
  'fl',
  'ga',
  'hi',
  'id',
  'il',
  'in',
  'ia',
  'ks',
  'ky',
  'la',
  'me',
  'md',
  'ma',
  'mi',
  'mn',
  'ms',
  'mo',
  'mt',
  'ne',
  'nv',
  'nh',
  'nj',
  'nm',
  'ny',
  'nc',
  'nd',
  'oh',
  'ok',
  'or',
  'pa',
  'ri',
  'sc',
  'sd',
  'tn',
  'tx',
  'ut',
  'vt',
  'va',
  'wa',
  'wv',
  'wi',
  'wy',
])
  STATES[code] = code;

const EXPECTED = [
  '最具体登记（RDAP 网络名+登记人）是居民 ISP 自己的网络，名单含 Comcast、AT&T 固网、Verizon 住宅、Spectrum、Cox、Frontier、Astound、Optimum、Mediacom、Midco、WOW、Cable One、Breezeline、TDS、Windstream、Consolidated、Ziply、Brightspeed、Metronet、Sonic、altafiber、Hawaiian Telcom、Shentel、Service Electric、Armstrong、EPB、Hargray、GCI、Google Fiber、Quantum Fiber。登记人是维护 handle 或为空，看不到这段登记给谁，不能通过。公告 ASN 只作旁证和否决，没有通过权。登记或公告命中蜂窝、企业网、托管、机房、过境词不过；IPinfo ASN 类型是 hosting 也不过。proxycheck 标 Business 或 IPinfo 公司类型是 business/hosting 时：登记不在名单则否决；登记在名单则记无法判断（登记身份和商业标签冲突，要人工核对池子）。登记不在名单时，IPinfo 的 ASN 类型是 isp 或 proxycheck 标 Residential，且登记人明确，可以通过。',
  '数据中心、服务器、VPN、代理、Tor 不能有明确的是。有一路为是就不过。至少 4 个明确的否、来自至少两家库、其中至少一个机房或服务器字段为否，才算通过。没查到或 Unknown 不单独否决。在售住宅代理不单独否决。',
  '机房主机名、蜂窝名、带 business 的名字不过。运营商自己的固网池名可以通过；登记方未具名时只写成「像」，不写成「某家自己的池」。没有反向域名不单独否决。',
  '至少两家库的州一致。运营商信息与登记对不上的库记为存疑、不计票。跨国跑偏点名但不单独否决。给出 expect_state 或 expect_tz 时多数州和时区必须相符。没有两家落在同一个州则不过。',
  '注册、支付、日常使用是同一个 IP，一个地址只绑一个账号。动态换地址和蜂窝网不过。一次查询证明不了地址会保持不变，所以默认是待核对；stable=1 人工确认后记为通过（人工确认）。rDNS 是动态池名时在检测里提示。',
];

const MANUAL_CHECKLIST = [
  'iplark：评分绿，类型显示「家宽」',
  'ping0.cc：不在黑名单里',
  '手机系统时区 = IP 所在州对应时区',
  '订阅、注册、日常使用的出口 = 这同一个地址',
  '一个地址只绑一个账号',
];

/* ------------------------------- 文本工具 ------------------------------- */

const HTML_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function unescapeHtml(text) {
  return String(text ?? '').replace(/&(#x?[0-9a-f]+|\w+);/gi, (raw, entity) => {
    if (entity[0] === '#') {
      const code =
        entity[1]?.toLowerCase() === 'x'
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : raw;
    }
    return HTML_ENTITIES[entity.toLowerCase()] ?? raw;
  });
}

function fold(text) {
  let out = unescapeHtml(text || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[-_/]/g, ' ');
  out = out.replace(/[^a-z0-9.+ ]/g, ' ');
  return out.replace(/\s+/g, ' ').trim();
}

function squashIdent(text) {
  return String(text ?? '').replace(/[^a-z0-9]/g, '');
}

function identTokens(blob) {
  const normalized = String(blob ?? '').replace(/\bat\s+(?:and\s+)?t\b/, 'att');
  const out = new Set();
  for (const raw of normalized.split(' ')) {
    const token = raw.replace(/^\.+|\.+$/g, '');
    if (token.length >= 3 && !GENERIC_TOKENS.has(token)) out.add(token);
  }
  return out;
}

function tri(value) {
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (value === null || value === undefined) return 'missing';
  const text = String(value).trim().toLowerCase();
  if (['yes', 'true', '1'].includes(text)) return 'yes';
  if (['no', 'false', '0'].includes(text)) return 'no';
  return 'unknown';
}

function joined(parts) {
  return parts.filter(Boolean).join('、');
}

/* ------------------------------ 网络请求 ------------------------------ */

async function fetchText(url, timeout = TIMEOUT_MS) {
  let response;
  try {
    response = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': UA,
        Accept: 'application/rdap+json, application/json, text/html;q=0.9',
      },
      signal: AbortSignal.timeout(timeout),
    });
  } catch (error) {
    return { code: 0, body: String(error?.name ?? error) };
  }
  let body;
  try {
    body = await boundedText(response, 500_000);
  } catch {
    body = '';
  }
  return { code: response.status, body };
}

async function fetchJson(url, retries = 0) {
  const { code, body } = await fetchText(url);
  if (code === 429 && retries > 0) {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    return fetchJson(url, retries - 1);
  }
  try {
    const data = JSON.parse(body);
    if (data && typeof data === 'object') return { code, data, error: '' };
    return { code, data: null, error: String(body).slice(0, 240) };
  } catch {
    return { code, data: null, error: String(body).slice(0, 240).replace(/\n/g, ' ') };
  }
}

/* ------------------------------ 数据源采集 ------------------------------ */

async function reverseDns(ip) {
  const query = ip.split('.').reverse().join('.') + '.in-addr.arpa';
  const { data } = await fetchJson(`${DOH_URL}?name=${encodeURIComponent(query)}&type=PTR`);
  const answers = Array.isArray(data?.Answer) ? data.Answer : [];
  const ptr = answers.find((answer) => answer.type === 12 && typeof answer.data === 'string');
  return ptr ? ptr.data.replace(/\.$/, '') : '无';
}

async function ripePrefix(ip) {
  const { code, data, error } = await fetchJson(
    `https://stat.ripe.net/data/prefix-overview/data.json?resource=${encodeURIComponent(ip)}`
  );
  const payload = data?.data;
  if (payload && typeof payload === 'object') {
    const asns = Array.isArray(payload.asns) ? payload.asns : [];
    return {
      ok: true,
      prefix: payload.resource,
      asns: asns.map((item) =>
        item && typeof item === 'object' ? `AS${item.asn} ${item.holder ?? ''}` : String(item)
      ),
    };
  }
  return { ok: false, error: error || `HTTP ${code}` };
}

function vcardFn(entity) {
  const vcard = entity?.vcardArray;
  if (!Array.isArray(vcard) || vcard.length < 2 || !Array.isArray(vcard[1])) return undefined;
  for (const item of vcard[1]) {
    if (Array.isArray(item) && item[0] === 'fn' && item.length >= 4) return String(item[3]);
  }
  return undefined;
}

async function rdapLookup(ip) {
  const errors = [];
  for (const url of [
    `https://rdap.arin.net/registry/ip/${encodeURIComponent(ip)}`,
    `https://rdap.db.ripe.net/ip/${encodeURIComponent(ip)}`,
  ]) {
    const { code, data, error } = await fetchJson(url);
    if (!data || !data.startAddress) {
      errors.push(error || `HTTP ${code}`);
      continue;
    }
    let registrant;
    for (const entity of Array.isArray(data.entities) ? data.entities : []) {
      const roles = new Set(
        (Array.isArray(entity?.roles) ? entity.roles : []).map((role) => String(role).toLowerCase())
      );
      if (roles.has('registrant')) {
        registrant = vcardFn(entity);
        if (registrant) break;
      }
    }
    const cidrs = Array.isArray(data.cidr0_cidrs) ? data.cidr0_cidrs : [];
    let best = null;
    for (const item of cidrs) {
      if (!item || typeof item !== 'object' || item.v4prefix === undefined) continue;
      const length = Number(item.length) || 0;
      if (best === null || length > best[0]) best = [length, `${item.v4prefix}/${length}`];
    }
    return {
      ok: true,
      name: data.name,
      handle: data.handle,
      prefix: best ? best[1] : undefined,
      length: best ? best[0] : undefined,
      type: data.type,
      registrant,
      start: data.startAddress,
      end: data.endAddress,
    };
  }
  return { ok: false, error: errors.join('；') || '无数据' };
}

async function ipinfoWidget(ip) {
  const { code, data, error } = await fetchJson(
    `https://ipinfo.io/widget/demo/${encodeURIComponent(ip)}`,
    1
  );
  const row = data?.data;
  if (row && typeof row === 'object') {
    const asn = row.asn && typeof row.asn === 'object' ? row.asn : {};
    const company = row.company && typeof row.company === 'object' ? row.company : {};
    const privacy = row.privacy && typeof row.privacy === 'object' ? row.privacy : {};
    return {
      ok: true,
      asn: asn.asn,
      asn_name: asn.name,
      asn_type: asn.type,
      route: asn.route,
      company: company.name,
      company_type: company.type,
      city: row.city,
      region: row.region,
      country: row.country,
      timezone: row.timezone,
      hostname: row.hostname,
      proxy: privacy.proxy,
      vpn: privacy.vpn,
      tor: privacy.tor,
      hosting: privacy.hosting,
    };
  }
  return { ok: false, error: error || `HTTP ${code}` };
}

async function ipwhoIs(ip) {
  const { code, data, error } = await fetchJson(`https://ipwho.is/${encodeURIComponent(ip)}`);
  if (data && data.success) {
    const conn = data.connection && typeof data.connection === 'object' ? data.connection : {};
    return {
      ok: true,
      asn: conn.asn,
      org: conn.org,
      isp: conn.isp,
      city: data.city,
      region: data.region,
      country: data.country || data.country_code,
      timezone: data.timezone && typeof data.timezone === 'object' ? data.timezone.id : undefined,
    };
  }
  return { ok: false, error: error || `HTTP ${code}` };
}

async function ipquery(ip) {
  const { code, data, error } = await fetchJson(`https://api.ipquery.io/${encodeURIComponent(ip)}`);
  if (data && data.ip) {
    const isp = data.isp && typeof data.isp === 'object' ? data.isp : {};
    const loc = data.location && typeof data.location === 'object' ? data.location : {};
    const risk = data.risk && typeof data.risk === 'object' ? data.risk : {};
    return {
      ok: true,
      asn: isp.asn,
      org: isp.org,
      isp: isp.isp,
      city: loc.city,
      region: loc.state,
      country: loc.country || loc.country_code,
      datacenter: risk.is_datacenter,
      vpn: risk.is_vpn,
      proxy: risk.is_proxy,
      tor: risk.is_tor,
      risk_score: risk.risk_score,
    };
  }
  return { ok: false, error: error || `HTTP ${code}` };
}

async function proxycheckV2(ip) {
  const { code, data, error } = await fetchJson(
    `https://proxycheck.io/v2/${encodeURIComponent(ip)}?vpn=1&asn=1&risk=1`
  );
  const row = data && typeof data === 'object' ? data[ip] : null;
  if (row && typeof row === 'object') {
    return {
      ok: true,
      asn: row.asn,
      provider: row.provider,
      organisation: row.organisation,
      type: row.type,
      proxy: row.proxy,
      risk: row.risk,
      hostname: row.hostname,
      city: row.city,
      region: row.region,
      country: row.country || row.isocode,
    };
  }
  return { ok: false, error: error || `HTTP ${code}` };
}

export function parseScamalyticsPage(raw) {
  const page = unescapeHtml(raw);
  const text = page
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, '\n');
  const lines = text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const answers = new Set(['Yes', 'No', 'Unknown']);
  function after(label) {
    const hits = lines
      .map((line, index) => (line === label ? index : -1))
      .filter((index) => index >= 0);
    for (const index of hits) {
      for (const follow of lines.slice(index + 1, index + 5)) {
        if (answers.has(follow)) return follow;
      }
    }
    for (const index of hits) {
      if (index + 1 < lines.length) return lines[index + 1];
    }
    return undefined;
  }

  const match = /Fraud Score:\s*(\d+)/i.exec(lines.join('\n'));
  return {
    ok: true,
    score: match ? Number(match[1]) : undefined,
    isp: after('ISP Name'),
    org: after('Organization Name'),
    datacenter: after('Datacenter'),
    vpn: after('Anonymizing VPN'),
    server: after('Server'),
    residential_proxy: after('Residential Proxy'),
    public_proxy: after('Public Proxy'),
  };
}

async function scamalytics(ip) {
  const { code, body } = await fetchText(`https://scamalytics.com/ip/${encodeURIComponent(ip)}`);
  if (code !== 200) return { ok: false, error: `HTTP ${code}` };
  return parseScamalyticsPage(body);
}

export async function collectGradeReport(ip) {
  const [rdns, ripe, rdap, ipinfo, ipwho, ipq, pc, scam] = await Promise.all([
    reverseDns(ip),
    ripePrefix(ip),
    rdapLookup(ip),
    ipinfoWidget(ip),
    ipwhoIs(ip),
    ipquery(ip),
    proxycheckV2(ip),
    scamalytics(ip),
  ]);
  return {
    ip,
    rdns,
    sources: {
      ripe,
      rdap,
      ipinfo,
      ipwho,
      ipquery: ipq,
      proxycheck: pc,
      scamalytics: scam,
    },
  };
}

/* ------------------------------ 判定：门一 ------------------------------ */

function identityBlobs(report) {
  const sources = report.sources ?? {};
  const rdap = sources.rdap ?? {};
  const ripe = sources.ripe ?? {};
  const reg = fold([rdap.name, rdap.registrant].map((part) => part ?? '').join(' '));
  const asn = fold((ripe.asns ?? []).map((item) => item ?? '').join(' '));
  return [reg, asn];
}

function sourceMatchesIdentity(identText, regBlob, asnBlob) {
  const ident = fold(identText);
  if (!ident) return true;
  const targetToks = new Set([...identTokens(regBlob), ...identTokens(asnBlob)]);
  if (!targetToks.size) return true;
  const targetSquash = squashIdent(regBlob + asnBlob);
  const identSquash = squashIdent(ident);
  for (const token of identTokens(ident)) {
    if (targetSquash.includes(squashIdent(token))) return true;
  }
  for (const token of targetToks) {
    if (identSquash.includes(squashIdent(token))) return true;
  }
  return false;
}

function otherSourceDc(report) {
  const sources = report.sources ?? {};
  const chunks = [];
  for (const key of ['ipwho', 'ipinfo', 'ipquery', 'proxycheck', 'scamalytics']) {
    const src = sources[key] ?? {};
    if (!src.ok) continue;
    chunks.push(
      ['org', 'isp', 'asn_name', 'company', 'provider', 'organisation']
        .map((field) => String(src[field] ?? ''))
        .join(' ')
    );
  }
  const blob = fold(chunks.join(' '));
  return joined(DC_WORDS.filter((word) => blob.includes(word)));
}

export function classifyHolder(report) {
  const sources = report.sources ?? {};
  const rdap = sources.rdap ?? {};
  const ripe = sources.ripe ?? {};
  if (!rdap.ok) {
    return {
      status: '无法判断',
      kind: 'unknown',
      isp: null,
      detail: `RDAP 没有返回最具体登记（${rdap.error || '无数据'}）。只看到公告 ASN 不能通过。`,
    };
  }

  const [regBlob, asnBlob] = identityBlobs(report);
  const prefix = rdap.prefix || '无前缀';
  const who = joined([String(rdap.name ?? ''), String(rdap.registrant ?? '')]);
  let announced = '';
  if (ripe.ok) announced = `路由公告 ${ripe.prefix}（${(ripe.asns ?? []).join('；')}）。`;
  const identity = `RDAP 最具体网络 ${prefix}，登记名 ${who}。${announced}`;

  const registrant = String(rdap.registrant ?? '').trim();
  const usable = Boolean(registrant) && !HANDLE_ONLY.test(registrant);

  // 统一反证，先于名单匹配：任何一条命中都不过。
  const regKinds = rejectHits(regBlob, regBlob);
  if (regKinds.length) {
    return {
      status: '不过',
      kind: regKinds[0],
      isp: null,
      detail: `${identity}最具体登记是${regKinds[0]}。固网名单只收居民 ISP 自己的用户池。`,
    };
  }
  const extra = otherSourceDc(report);
  if (extra) {
    return {
      status: '不过',
      kind: 'conflict',
      isp: null,
      detail: `${identity}其他库的组织字段写成了托管：${extra}。`,
    };
  }
  const ipinfo = sources.ipinfo ?? {};
  const asnType = String(ipinfo.asn_type ?? '').toLowerCase();
  const companyType = String(ipinfo.company_type ?? '').toLowerCase();
  if (ipinfo.ok && asnType === 'hosting') {
    return {
      status: '不过',
      kind: 'business',
      isp: null,
      detail: `${identity}IPinfo 把 ASN 标成 hosting。托管网络不过。`,
    };
  }
  const proxycheck = sources.proxycheck ?? {};
  const bizLabels = [];
  if (proxycheck.ok && String(proxycheck.type ?? '').toLowerCase() === 'business')
    bizLabels.push('proxycheck 类型是 Business');
  if (ipinfo.ok && ['hosting', 'business'].includes(companyType))
    bizLabels.push(`IPinfo 公司类型是 ${ipinfo.company_type || 'business'}`);

  const matched = FIXED_ISPS.find((isp) => isp.name.test(regBlob));
  if (matched) {
    const asnKinds = rejectHits(asnBlob, regBlob);
    if (asnKinds.length) {
      return {
        status: '不过',
        kind: 'conflict',
        isp: matched.label,
        detail: `${identity}登记是 ${matched.label}，但公告 ASN 是${asnKinds[0]}，不像它自己的用户池。`,
      };
    }
    if (bizLabels.length) {
      return {
        status: '无法判断',
        kind: 'conflict',
        isp: matched.label,
        detail: `${identity}最具体登记是 ${matched.label}，但${bizLabels.join('；')}。登记身份和商业标签冲突，可能是居民池也可能是商业池，要人工核对（看 rDNS 池名、iplark、ip2location）。`,
      };
    }
    return {
      status: '通过',
      kind: 'fixed',
      isp: matched.label,
      detail: `${identity}最具体登记人是 ${matched.label} 自己的用户池。`,
    };
  }
  if (bizLabels.length) {
    return {
      status: '不过',
      kind: 'business',
      isp: null,
      detail: `${identity}${bizLabels.join('；')}。商业网络不过。`,
    };
  }

  const asnKinds = rejectHits(asnBlob, regBlob);
  if (asnKinds.length) {
    return {
      status: '不过',
      kind: asnKinds[0],
      isp: null,
      detail: `${identity}登记名不在固网名单里，公告 ASN 是${asnKinds[0]}。`,
    };
  }

  const pcType = String(proxycheck.type ?? '').toLowerCase();
  const ispSignals = [];
  if (ipinfo.ok && asnType === 'isp') ispSignals.push('IPinfo ASN 类型是 isp');
  if (proxycheck.ok && pcType === 'residential') ispSignals.push('proxycheck 类型是 Residential');
  if (usable && ispSignals.length) {
    return {
      status: '通过',
      kind: 'fixed',
      isp: null,
      detail: `${identity}不在常用固网名单里。${ispSignals.join('，')}，按居民 ISP 通过。登记不在大名单，可能是静态代理或转售段，要确认真家宽请人工核对。`,
    };
  }

  if (!usable) {
    const asnIsp = FIXED_ISPS.find((isp) => isp.name.test(asnBlob));
    if (asnIsp) {
      return {
        status: '不过',
        kind: 'unknown',
        isp: null,
        detail: `${identity}只看到公告 ASN 是 ${asnIsp.label}，看不到这段登记给谁（登记人是维护 handle 或为空）。母 ASN 不能当登记身份。`,
      };
    }
    return {
      status: '无法判断',
      kind: 'unknown',
      isp: null,
      detail: `${identity}登记人是维护 handle 或为空，看不到这段登记给谁，也没有足够证据判断。`,
    };
  }

  return {
    status: '无法判断',
    kind: 'other',
    isp: null,
    detail: `${identity}名字不在常用固网名单里，也看不出机房或企业网。IPinfo 和 proxycheck 都没给出居民 ISP 类型，这一条不能否决，也不能通过。`,
  };
}

/* ------------------------------ 判定：门二 ------------------------------ */

export function gatePrivacy(report) {
  const sources = report.sources ?? {};
  const bad = [];
  const missing = [];
  const unknown = [];
  const proxycheck = sources.proxycheck ?? {};
  if (proxycheck.ok) {
    const kind = String(proxycheck.type ?? '')
      .trim()
      .toLowerCase();
    if (HOSTILE_PROXY_TYPES.has(kind)) bad.push(`proxycheck 类型 ${proxycheck.type}`);
  }
  const good = [];
  const goodSources = new Set();
  let dcGood = false;
  for (const [label, sourceName, field] of PRIVACY_FIELDS) {
    const source = sources[sourceName] ?? {};
    if (!source.ok) {
      missing.push(label);
      continue;
    }
    const state = tri(source[field]);
    if (state === 'yes') {
      bad.push(label);
    } else if (state === 'no') {
      good.push(label);
      goodSources.add(sourceName);
      if (DC_PRIVACY.has(`${sourceName}:${field}`)) dcGood = true;
    } else if (state === 'missing') {
      missing.push(label);
    } else if (state === 'unknown') {
      unknown.push(label);
    }
  }

  if (bad.length) {
    return { status: '不过', detail: `明确为是：${joined(bad)}。` };
  }
  if (good.length < 4 || goodSources.size < 2 || !dcGood) {
    const parts = [];
    if (good.length < 4) parts.push('明确为否的字段不够');
    if (goodSources.size < 2) parts.push('明确的否只来自一家库');
    if (!dcGood) parts.push('没有任何机房/服务器字段明确为否');
    let detail = `${parts.join('；')}。`;
    if (missing.length) detail += `没查到：${joined(missing)}。`;
    if (unknown.length) detail += `结果是 Unknown：${joined(unknown)}。`;
    return { status: '无法判断', detail };
  }
  let detail = `已明确为否：${joined(good)}。`;
  if (missing.length || unknown.length) {
    const extra = [];
    if (missing.length) extra.push(`没查到：${joined(missing)}`);
    if (unknown.length) extra.push(`Unknown：${joined(unknown)}`);
    detail += ` ${extra.join(' ')}。空着的字段不单独否决。`;
  } else {
    detail = '机房、服务器、VPN、代理、Tor 这几路都是否。';
  }
  return { status: '通过', detail };
}

/* ------------------------------ 判定：门三 ------------------------------ */

export function gateRdns(report, holder) {
  const host = String(report.rdns ?? '').trim();
  if (host === '' || host === '无') {
    return {
      status: '通过',
      detail:
        '没有反向域名。没有反向域名不单独否决。机房主机名、蜂窝名、带 business 的名字仍然否决。',
    };
  }
  if (MOBILE_RDNS.test(host)) {
    return { status: '不过', detail: `${host} 是蜂窝命名，固网用户池对不上这个名字。` };
  }
  if (BUSINESS_RDNS.test(host)) {
    return { status: '不过', detail: `${host} 带 business，这是企业网命名。` };
  }

  const hostL = host.toLowerCase().replace(/\.$/, '');
  const domainIsp = FIXED_ISPS.find((isp) =>
    isp.rdns.some((domain) => hostL === domain || hostL.endsWith(`.${domain}`))
  );
  const looksLikePool = POOL_RDNS.test(host);
  if (domainIsp && looksLikePool) {
    if (holder.isp && holder.isp !== domainIsp.label) {
      return {
        status: '不过',
        detail: `${host} 像 ${domainIsp.label} 的用户池，登记人却是 ${holder.isp}。`,
      };
    }
    if (holder.status !== '通过') {
      if (holder.kind === 'conflict' && holder.isp === domainIsp.label) {
        return {
          status: '无法判断',
          detail: `${host} 像 ${domainIsp.label} 的用户池，但第 1 条登记与商业标签冲突还没解决，要人工核对池子。`,
        };
      }
      return {
        status: '不过',
        detail: `${host} 像 ${domainIsp.label} 的用户池，但前缀登记没有通过固网名单。`,
      };
    }
    if (holder.isp) {
      return {
        status: '通过',
        detail: `${host} 是 ${domainIsp.label} 自己的固网用户池命名。`,
      };
    }
    return {
      status: '通过',
      detail: `${host} 像 ${domainIsp.label} 的固网池名，登记方未在该名单具名（第 1 条按居民 ISP 通过）。`,
    };
  }
  if (looksLikePool || domainIsp) {
    const owner = domainIsp ? domainIsp.label : '某家运营商';
    return {
      status: '无法判断',
      detail: `${host} 有一点用户池的样子（${owner}），但对不上「这家运营商自己的固网池名」这一整条。`,
    };
  }
  return {
    status: '不过',
    detail: `${host} 对不上固网用户池命名。固网常见 pool-、c-、dsl-、hsd、lightspeed，再加这家运营商自己的域名。`,
  };
}

/* ------------------------------ 判定：门四 ------------------------------ */

function normCity(city) {
  let text = fold(city);
  text = text.replace(/ city$/, '');
  if (text === 'nyc' || text === 'new york city') return 'new york';
  return text;
}

function normRegion(region) {
  const text = fold(region).replaceAll('.', '');
  return STATES[text] ?? text;
}

export function gateGeo(report) {
  const sources = report.sources ?? {};
  const specs = [
    ['ipwho', 'city', 'region', 'timezone', 'country', ['org', 'isp', 'asn']],
    ['ipquery', 'city', 'region', null, 'country', ['org', 'isp', 'asn']],
    ['proxycheck', 'city', 'region', null, 'country', ['provider', 'organisation', 'asn']],
    ['ipinfo', 'city', 'region', 'timezone', 'country', ['asn_name', 'company', 'asn']],
  ];
  const [regBlob, asnBlob] = identityBlobs(report);
  const places = [];
  for (const [sourceName, cityKey, regionKey, tzKey, countryKey, identKeys] of specs) {
    const source = sources[sourceName] ?? {};
    if (!source.ok) continue;
    const cityRaw = String(source[cityKey] ?? '').trim();
    const regionRaw = String(source[regionKey] ?? '').trim();
    const region = normRegion(regionRaw);
    const city = normCity(cityRaw);
    const tz = tzKey ? String(source[tzKey] ?? '').trim() : '';
    if (!region && !city) continue;
    const identText = identKeys.map((key) => String(source[key] ?? '')).join(' ');
    places.push({
      source: sourceName,
      city,
      region,
      city_raw: cityRaw,
      region_raw: regionRaw,
      tz,
      country: fold(String(source[countryKey] ?? '')),
      suspect: Boolean(identText.trim()) && !sourceMatchesIdentity(identText, regBlob, asnBlob),
    });
  }

  if (places.length < 2) {
    return { status: '无法判断', detail: '给出位置的库少于两家。' };
  }

  const trusted = places.filter((item) => !item.suspect);
  const suspects = places.filter((item) => item.suspect);
  if (trusted.length < 2) {
    const names = joined(suspects.map((item) => item.source));
    return {
      status: '无法判断',
      detail: `与登记或公告对得上的库不足两家（对不上：${names || '无'}），凑不出多数。`,
    };
  }

  const shown = joined(
    trusted.map(
      (item) => `${item.source} ${item.city_raw || '无城市'}, ${item.region_raw || '无州'}`
    )
  );
  const counts = {};
  for (const item of trusted) {
    if (item.region) counts[item.region] = (counts[item.region] ?? 0) + 1;
  }
  const top = Math.max(0, ...Object.values(counts));
  const leaders = Object.keys(counts).filter((region) => counts[region] === top);
  if (leaders.length !== 1 || top < 2) {
    return { status: '不过', detail: `没有两家库落在同一个州：${shown}。` };
  }
  const majority = leaders[0];
  const agreed = trusted.filter((item) => item.region === majority);
  const outliers = trusted.filter((item) => item.region && item.region !== majority);
  const zones = new Set(agreed.map((item) => item.tz).filter(Boolean));
  if (zones.size > 1) {
    return {
      status: '不过',
      detail: `同一州里的时区不一致：${joined([...zones].sort())}。位置是 ${shown}。`,
    };
  }

  const expect = report.expect ?? {};
  const expState = expect.state ? normRegion(String(expect.state)) : '';
  if (expState && expState !== majority) {
    return {
      status: '不过',
      detail: `多数库落在 ${majority}（${shown}），与你期望的 ${expect.state} 不一致。`,
    };
  }
  const expTz = String(expect.tz ?? '').trim();
  if (expTz) {
    if (zones.size && ![...zones].some((zone) => zone.toLowerCase() === expTz.toLowerCase())) {
      return {
        status: '不过',
        detail: `多数库在 ${majority}，但时区是 ${joined([...zones].sort())}，与你期望的 ${expTz} 不一致。位置是 ${shown}。`,
      };
    }
    if (!zones.size) {
      return {
        status: '无法判断',
        detail: `多数库在 ${majority}，但没有库给出时区，核对不了你期望的 ${expTz}。`,
      };
    }
  }

  const zoneText = zones.size
    ? `时区 ${joined([...zones].sort())}。`
    : '时区只有不到两家，暂不否决。';
  const rawCities = [];
  for (const item of agreed) {
    if (item.city_raw && !rawCities.includes(item.city_raw)) rawCities.push(item.city_raw);
  }
  const cityText = rawCities.length ? joined(rawCities) : '无城市';
  const regionRaw = agreed.find((item) => item.region_raw)?.region_raw ?? majority;
  const srcText = agreed.map((item) => item.source).join('、');
  let detail = `${srcText} 落在 ${cityText}, ${regionRaw}。${zoneText}`;

  const majorityCountry = agreed.find((item) => item.country)?.country ?? '';
  const notes = [];
  for (const item of outliers) {
    let tag = `${item.source} ${item.city_raw}, ${item.region_raw}`;
    if (item.country && majorityCountry && item.country !== majorityCountry) {
      tag += `（另一国：${item.country}）`;
    }
    notes.push(tag);
  }
  if (notes.length) detail += `有库跑偏，不单独否决：${joined(notes)}。`;
  if (suspects.length) {
    const odd = joined(
      suspects.map((item) => `${item.source} ${item.city_raw}, ${item.region_raw}`)
    );
    detail += `存疑（运营商与登记对不上，不计票）：${odd}。`;
  }
  return { status: '通过', detail };
}

/* ------------------------------ 判定：门五 ------------------------------ */

export function gateStable(report, holder) {
  const signals = [];
  if (holder.kind === '蜂窝网') signals.push('登记是蜂窝网');
  const host = String(report.rdns ?? '');
  if (host !== '' && host !== '无' && MOBILE_RDNS.test(host)) signals.push('反向域名是蜂窝命名');
  const proxycheck = report.sources?.proxycheck ?? {};
  if (proxycheck.ok && String(proxycheck.type ?? '').toLowerCase() === 'wireless')
    signals.push('proxycheck 类型是 Wireless');
  const reminder = '订阅当时的出口和使用当时的出口必须是同一个地址，一个地址只绑一个账号。';
  if (signals.length) {
    return {
      status: '不过',
      detail: `${joined(signals)}。这类地址会漂，撑不住订阅和使用是同一个出口。${reminder}`,
    };
  }
  let extra = '';
  if (/(?:^|[.\-_])dynamic/i.test(host)) {
    extra = '反向域名是动态池命名；如果你买的是静态独享 IP，要向商家确认它是不是固定地址。';
  }
  if (report.stable_confirmed) {
    return {
      status: '通过',
      detail: `人工确认：订阅出口和使用出口已核对为同一地址。${extra}${reminder}`,
    };
  }
  if (holder.status === '通过') {
    return {
      status: '待核对',
      detail: `公开库看不到它接下来会不会变。固网用户池比蜂窝更可能稳住。${extra}${reminder}`,
    };
  }
  return {
    status: '待核对',
    detail: `这次查询没有看到蜂窝或无线迹象。${extra}${reminder}`,
  };
}

/* ------------------------------ 旁证与分档 ------------------------------ */

export function sideNotes(report) {
  const scam = report.sources?.scamalytics ?? {};
  const notes = [];
  if (!scam.ok || scam.score === null || scam.score === undefined) {
    notes.push('欺诈分没取到。这个分数本来也只是旁证。');
  } else {
    const tone = scam.score >= 25 ? '偏高' : '不高';
    notes.push(`欺诈分 ${scam.score}，${tone}。分数低不能证明这是家宽。`);
  }
  const residential = scam.ok ? tri(scam.residential_proxy) : 'missing';
  if (residential === 'no') {
    notes.push('住宅代理为否，只说明没被标成在售代理，不能证明这是家宽。');
  } else if (residential === 'yes') {
    notes.push('住宅代理为是。静态独享的 ISP 代理和动态共享池都会被这样标，这一项不单独否决。');
  } else {
    notes.push('住宅代理没有明确结果，不能拿来证明是家宽。');
  }

  const ipinfo = report.sources?.ipinfo ?? {};
  const asnType = String(ipinfo.asn_type ?? '').toLowerCase();
  const sources = report.sources ?? {};
  const badFlags = PRIVACY_FIELDS.filter(
    ([, sourceName, field]) => tri((sources[sourceName] ?? {})[field]) === 'yes'
  ).map(([label]) => label);
  const facts = [];
  facts.push(ipinfo.ok ? `IPinfo ASN 类型 ${ipinfo.asn_type || '无'}` : 'IPinfo 没查到');
  facts.push(badFlags.length ? `机房代理类有「是」：${joined(badFlags)}` : '机房代理类没有「是」');
  facts.push(
    scam.ok && scam.score !== null && scam.score !== undefined
      ? `欺诈分 ${scam.score}`
      : '欺诈分未知'
  );
  const authorOk =
    Boolean(ipinfo.ok) &&
    asnType === 'isp' &&
    !badFlags.length &&
    (!scam.ok || scam.score === null || scam.score === undefined || scam.score < 25);
  notes.push(
    `封号作者验收口径对照（仅旁证，不改结论）：${facts.join('；')}。` +
      (authorOk ? '按这个口径可过' : '按这个口径过不了') +
      '。它不管登记身份，商家说的双 ISP/伪家宽段也能过；iplark 一项仍需人工核对。'
  );
  notes.push('五条都过，也不保证这个地址上的账号不会被封。');
  return notes;
}

/**
 * 品质分档十级：T0 / T1± / T2± / T3±。
 * 判定顺序：指纹层 > 蜂窝 > 登记层 > 池名/公告/标签层。
 */
export function qualityTier(report, holder, gates) {
  const sources = report.sources ?? {};
  const ipinfo = sources.ipinfo ?? {};
  const proxycheck = sources.proxycheck ?? {};
  const asnType = String(ipinfo.asn_type ?? '').toLowerCase();
  const pcType = String(proxycheck.type ?? '').toLowerCase();
  const bad = PRIVACY_FIELDS.filter(
    ([, sourceName, field]) => tri((sources[sourceName] ?? {})[field]) === 'yes'
  ).map(([label]) => label);
  const ispLabel =
    (Boolean(ipinfo.ok) && asnType === 'isp') ||
    (Boolean(proxycheck.ok) && pcType === 'residential');
  const host = String(report.rdns ?? '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
  const [, asnBlob] = identityBlobs(report);
  const asnRes = FIXED_ISPS.some((isp) => isp.name.test(asnBlob));
  const domainMatch = FIXED_ISPS.some((isp) =>
    isp.rdns.some((domain) => host === domain || host.endsWith(`.${domain}`))
  );
  const poolish = Boolean(POOL_RDNS.test(host));
  const bizRdns = Boolean(BUSINESS_RDNS.test(host));
  const hStatus = holder.status;
  const hKind = holder.kind;
  const hIsp = holder.isp;
  const [g2, g3, g4] = [gates[1].status, gates[2].status, gates[3].status];

  if (bad.length) {
    return [
      'T3- 带毒指纹',
      `${joined(bad)} 是明确的是。指纹层露馅，跟登记写什么都没关系。任何用途都别碰。`,
    ];
  }
  if (hKind === '蜂窝网' || MOBILE_RDNS.test(host)) {
    return ['T3 蜂窝/不明', '蜂窝地址会漂且 CGN 共享，撑不住同一个固定出口。'];
  }
  if (hStatus === '通过' && hIsp && g2 === '通过' && g3 === '通过' && g4 === '通过') {
    return ['T0 真家宽', '名单内居民 ISP 登记、池名对得上、标记全干净、地理一致。市面几乎买不到。'];
  }
  if (hStatus === '无法判断' && hKind === 'conflict') {
    if (domainMatch && !bizRdns && poolish) {
      return [
        'T1+ 准家宽·住宅域可见',
        `登记是 ${hIsp}、rDNS 落在该 ISP 住宅池域，只差 Business 标签冲突未决。真 ISP 商业池里最像家宽的一档，可买，人工核。`,
      ];
    }
    return [
      'T1 准家宽·商业池',
      `登记是 ${hIsp}，商业标签冲突 + 商业/非住宅池名（wsip 类）。真 ISP 商业产品，可买但不算家宽形状。`,
    ];
  }
  if (hStatus === '通过' && hIsp) {
    const gaps = [];
    if (g3 !== '通过') gaps.push('rDNS 不是确定的池名');
    if (g4 !== '通过') gaps.push('地理没对齐');
    if (g2 !== '通过') gaps.push('机房代理证据不足');
    return [
      'T1 准家宽·商业池',
      `名单内 ${hIsp} 登记但${joined(gaps)}（含商业/静态池名）。可买，人工核对。`,
    ];
  }
  if (hStatus === '通过' || (hStatus === '无法判断' && hKind === 'other' && ispLabel)) {
    return [
      'T1- 准家宽·小众ISP',
      '名单外小居民 ISP（兜底通过或真实登记人+居民标签）。登记人真但证据薄，可买，人工核池子和独享性。',
    ];
  }
  if (hStatus === '不过') {
    if (domainMatch || (ispLabel && asnRes)) {
      const which = joined(
        [
          ['真ISP域名rDNS', domainMatch],
          ['居民ASN公告', asnRes],
          ['居民标签', ispLabel],
        ]
          .filter(([, yes]) => yes)
          .map(([x]) => x)
      );
      return [
        'T2+ 伪家宽·遗产高配',
        `登记是过境/转售，但指纹干净且${which}指向真居民池（遗产段/居民ASN转售）。作者口径上等货，本工具不背书。`,
      ];
    }
    if (ispLabel && poolish) {
      return [
        'T2 伪家宽·标配',
        '登记是过境/转售，居民标签 + 池形 rDNS 各有一条支撑。作者口径普通货，标签随时会掉。',
      ];
    }
    if (ispLabel) {
      return [
        'T2- 伪家宽·纯标签',
        '登记是过境/转售，只有分类标签是家宽，池名公告都不沾边。标签戏法，随时现原形。',
      ];
    }
    return [
      'T3+ 干净非家宽',
      '登记不合格、无居民信号，但指纹干净。不是家宽但是稳定固定 IP，非风控场景可用，别当家宽用。',
    ];
  }
  return ['T3 蜂窝/不明', '登记身份证据不足，定不了档。不知道好坏的东西别赌。'];
}

/* -------------------------------- 汇总判定 ------------------------------ */

export function judgeGrade(report) {
  const holder = classifyHolder(report);
  const gates = [
    { name: '前缀持有者', expected: EXPECTED[0], status: holder.status, detail: holder.detail },
    { name: '机房与代理', expected: EXPECTED[1], ...gatePrivacy(report) },
    { name: '反向域名', expected: EXPECTED[2], ...gateRdns(report, holder) },
    { name: '地理位置', expected: EXPECTED[3], ...gateGeo(report) },
    { name: '地址稳定', expected: EXPECTED[4], ...gateStable(report, holder) },
  ];
  const failed = gates.flatMap((gate, index) => (gate.status === '不过' ? [index + 1] : []));
  const unclear = gates.flatMap((gate, index) => (gate.status === '无法判断' ? [index + 1] : []));
  const onlyManual =
    !failed.length && !unclear.length && gates.some((gate) => gate.status === '待核对');
  let verdict;
  if (failed.length) {
    verdict = `不要拿来开新号。第 ${failed.join('、')} 条不过。`;
  } else if (onlyManual) {
    verdict =
      '公开库能查的都过了。第 5 条还要你核对：订阅当时的出口和使用当时的出口是不是这同一个地址。一个地址只绑一个账号。';
  } else if (unclear.length) {
    verdict = `还不能当成通过。第 ${unclear.join('、')} 条没查全。`;
  } else if (report.stable_confirmed) {
    verdict = '五条都通过（第 5 条为人工确认）。这只说明公开库目前没有否决项，不保证账号不会被封。';
  } else {
    verdict = '五条都通过。这只说明公开库目前没有否决项，不保证账号不会被封。';
  }
  const [tier, tierWhy] = qualityTier(report, holder, gates);
  return {
    verdict,
    gates,
    tier,
    tier_why: tierWhy,
    side: sideNotes(report),
    checklist: MANUAL_CHECKLIST,
  };
}

/* -------------------------------- HTTP 入口 ----------------------------- */

export async function ipGrade(value, url) {
  const ip = publicIp(value);
  if (isIP(ip) !== 4) throw new HttpError(400, '五门判定只支持 IPv4 地址');
  const expect = {
    state: url.searchParams.get('expect_state') || undefined,
    tz: url.searchParams.get('expect_tz') || undefined,
  };
  const stable = url.searchParams.get('stable') === '1';
  const cacheKey = `${url.origin}\0${ip}\0${CACHE_VERSION}\0${expect.state ?? ''}\0${expect.tz ?? ''}\0${stable ? 's' : ''}`;
  const memory = rememberEdge() ? edgeMemory().grade : null;
  const hit = memory?.get(cacheKey);
  if (hit && hit.expires > Date.now()) return json(hit.payload);

  const report = await collectGradeReport(ip);
  report.expect = expect;
  report.stable_confirmed = stable;
  const judged = judgeGrade(report);
  const payload = {
    ip: report.ip,
    rdns: report.rdns,
    fetched_at: new Date().toISOString(),
    expect: { state: expect.state ?? null, tz: expect.tz ?? null },
    stable_confirmed: stable,
    sources: report.sources,
    ...judged,
    tier_scale:
      'T0 真家宽 / T1+ T1 T1- 准家宽 / T2+ T2 T2- 伪家宽 / T3+ T3 T3- 不可用；分档看登记层>指纹层>标签层，不改五门结论',
  };
  if (memory) {
    const okSources = Object.values(report.sources ?? {}).filter((s) => s?.ok).length;
    const ttl = okSources >= CACHE_MIN_SOURCES ? CACHE_TTL_MS : CACHE_TTL_DEGRADED_MS;
    remember(memory, cacheKey, { expires: Date.now() + ttl, payload }, 100);
  }
  return json(payload);
}
