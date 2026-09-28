import { isIP } from 'node:net';

import { boundedText, publicIp } from './http.js';
import { prefixFromRdap } from './whois.js';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const TIMEOUT_MS = 8_000;
const CACHE_VERSION = 'v13';

const HREF = {
  ip2location: (ip) => `https://www.ip2location.io/${encodeURIComponent(ip)}`,
  ipinfo: (ip) => `https://ipinfo.io/${encodeURIComponent(ip)}`,
  ipapi: (ip) => `https://ip-api.com/#${encodeURIComponent(ip)}`,
  scamalytics: (ip) => `https://scamalytics.com/ip/${encodeURIComponent(ip)}`,
  ipqs: (ip) =>
    `https://www.ipqualityscore.com/free-ip-lookup-proxy-vpn-test/lookup/${encodeURIComponent(ip)}`,
  abuseipdb: (ip) => `https://www.abuseipdb.com/check/${encodeURIComponent(ip)}`,
  ippure: (ip) => `https://ippure.com/?ip=${encodeURIComponent(ip)}`,
  proxycheck: (ip) => `https://proxycheck.io/v3/${encodeURIComponent(ip)}`,
  dnsbl: (ip) =>
    `https://mxtoolbox.com/SuperTool.aspx?action=blacklist%3a${encodeURIComponent(ip)}&run=toolpage`,
  torexit: () => 'https://check.torproject.org/torbulkexitlist',
  ipregistry: (ip) => `https://ipregistry.co/${encodeURIComponent(ip)}`,
};

const IPPURE_RISK = (ip) => `https://api.123169.xyz/api/info/ip-risk/${encodeURIComponent(ip)}`;
const IPQS_URL = (ip, key) =>
  `https://www.ipqualityscore.com/api/json/ip/${encodeURIComponent(key)}/${encodeURIComponent(ip)}?strictness=1&allow_public_access_points=true`;
const ABUSEIPDB_URL = (ip) =>
  `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(ip)}&maxAgeInDays=90`;
const TOR_EXIT_LIST = 'https://check.torproject.org/torbulkexitlist';
const MXTOOLBOX_USAGE = 'https://api.mxtoolbox.com/api/v1/Usage';
const MXTOOLBOX_BLACKLIST = (ip) =>
  `https://mxtoolbox.com/api/v1/lookup/blacklist/${encodeURIComponent(ip)}`;
const DOH_URL = 'https://cloudflare-dns.com/dns-query';
const IPREGISTRY_HOME = 'https://ipregistry.co';
// Public demo key ipregistry.co serves its own lookup page with; the
// homepage is rescraped if it ever rotates.
const IPREGISTRY_KEY_FALLBACK = 'sb69ksjcajfs4c';
const IPREGISTRY_API = (ip, key) =>
  `https://api.ipregistry.co/${encodeURIComponent(ip)}?hostname=true&key=${encodeURIComponent(key)}`;

/**
 * IPv4 blocklist zones verified to answer A-record lookups through an open
 * DoH resolver (each responds to the conventional 2.0.0.127 test entry or
 * equivalent). Whitelist, reputation, geography-policy, and Tor-enumeration
 * zones are deliberately excluded: a "listing" there is not an abuse verdict.
 */
const DNSBL_ZONES = [
  ['bl.spamcop.net', 'SpamCop'],
  ['dnsbl.dronebl.org', 'DroneBL'],
  ['all.s5h.net', 'S5H'],
  ['bl.mailspike.net', 'MailSpike'],
  ['dnsbl-1.uceprotect.net', 'UCEPROTECT-1'],
  ['dnsbl-2.uceprotect.net', 'UCEPROTECT-2'],
  ['dnsbl-3.uceprotect.net', 'UCEPROTECT-3'],
  ['psbl.surriel.com', 'PSBL'],
  ['rbl.interserver.net', 'InterServer'],
  ['b.barracudacentral.org', 'Barracuda'],
  ['bb.barracudacentral.org', 'Barracuda-BB'],
  ['bl.blocklist.de', 'Blocklist.de'],
  ['black.junkemailfilter.com', 'JunkEmailFilter'],
  ['truncate.gbudb.net', 'GBUdb'],
  ['ips.backscatterer.org', 'Backscatterer'],
  ['bl.spameatingmonkey.net', 'SEM'],
  ['bl.scientificspam.net', 'ScientificSpam'],
  ['bl.suomispam.net', 'SuomiSpam'],
  ['rbl.blockedservers.com', 'BlockedServers'],
  ['netscan.rbl.blockedservers.com', 'NetScan'],
  ['0spam.fusionzero.com', '0Spam'],
  ['dnsbl.zapbl.net', 'ZapBL'],
  ['dnsbl.justspam.org', 'JustSpam'],
  ['dnsrbl.swinog.ch', 'SwiNOG'],
  ['bl.nszones.com', 'NSZones-BL'],
  ['sbl.nszones.com', 'NSZones-SBL'],
  ['mail-abuse.blacklist.jippg.org', 'JIPPG'],
  ['spam.dnsbl.anonmails.de', 'Anonmails'],
  ['spambot.bls.digibase.ca', 'Digibase'],
  ['v4.fullbogons.cymru.com', 'Cymru-Bogons'],
];

const ORDER = [
  'ippure-purity',
  'scamalytics-fraud',
  'ip2location-fraud',
  'ipqs-fraud',
  'abuseipdb-fraud',
  'dnsbl-blocklist',
  'ipregistry-abuse',
  'ipinfo-privacy',
  'ip2location-proxy',
  'ipapi-proxy',
  'proxycheck-proxy',
  'proxycheck-risk',
  'ipqs-privacy',
  'abuseipdb-privacy',
  'ipregistry-privacy',
  'torexit-exit',
  'scamalytics-proxy',
  'ip2location-usage',
  'ipapi-usage',
  'proxycheck-usage',
  'ipqs-usage',
  'abuseipdb-usage',
  'ipregistry-usage',
  'scamalytics-usage',
];

function mentionsIp(html, ip) {
  if (typeof html !== 'string' || typeof ip !== 'string' || !ip) return false;
  const escaped = ip.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Avoid accepting an address embedded in a longer IPv4/IPv6 token.
  return new RegExp(`(?<![0-9a-f:.])${escaped}(?![0-9a-f:.])`, 'i').test(html);
}

const RESPONSE_IP_KEYS = [
  'ip',
  'IP',
  'ip_address',
  'ipAddress',
  'query',
  'query_ip',
  'queryIp',
  'address',
];

function responseIpValues(payload) {
  const objects = [payload, payload?.data, payload?.result];
  const values = [];
  for (const object of objects) {
    if (!object || typeof object !== 'object') continue;
    for (const key of RESPONSE_IP_KEYS) {
      const value = object[key];
      if (typeof value === 'string' && isIP(value.trim())) values.push(value.trim());
    }
  }
  return values;
}

function responseMatchesIp(payload, ip) {
  const expected = ip.toLowerCase();
  return responseIpValues(payload).every((value) => value.toLowerCase() === expected);
}

function cleanText(value) {
  const text = value?.replace(/\s+/g, ' ').trim();
  if (!text || text === '-' || text === '—') return undefined;
  return text;
}

function finiteNumber(value) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseCoords(text) {
  const match = cleanText(text)?.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return {};
  return { latitude: Number(match[1]), longitude: Number(match[2]) };
}

function place(source, ip, fields) {
  const city = cleanText(fields.city);
  const region = cleanText(fields.region);
  const country = cleanText(fields.country);
  if (!city && !region && !country) return null;
  const code = cleanText(fields.country_code)?.toUpperCase();
  return {
    source,
    href: HREF[source](ip),
    city,
    region,
    country,
    country_code: code && /^[A-Z]{2}$/.test(code) ? code : undefined,
    latitude: finiteNumber(fields.latitude),
    longitude: finiteNumber(fields.longitude),
  };
}

function fieldText(html, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = html.match(
    new RegExp(
      `<label[^>]*>\\s*${escaped}\\s*</label>[\\s\\S]{0,400}?<p class="ip-result">([\\s\\S]*?)</p>`,
      'i'
    )
  );
  if (!match) return undefined;
  return cleanText(
    match[1]
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
  );
}

export function placeFromIp2Location(html, ip) {
  if (typeof html !== 'string' || !mentionsIp(html, ip)) return null;
  const rawCountry = fieldText(html, 'Country');
  const countryMatch = rawCountry?.match(/^(.*?)(?:\((\w{2})\))?\s*$/);
  const coords = parseCoords(fieldText(html, 'Coordinates'));
  return place('ip2location', ip, {
    city: fieldText(html, 'City'),
    region: fieldText(html, 'Region'),
    country: countryMatch?.[1]?.trim(),
    country_code: countryMatch?.[2],
    latitude: coords.latitude,
    longitude: coords.longitude,
  });
}

export function placeFromIpinfo(html, ip) {
  if (typeof html !== 'string') return null;
  const values = {};
  for (const match of html.matchAll(
    /\{"@type":"PropertyValue","name":"([^"]+)","value":"([^"]*)"\}/g
  ))
    values[match[1]] = match[2];
  if (values['IP Address'] !== ip) return null;
  const coords = parseCoords(values.Coordinates);
  return place('ipinfo', ip, {
    city: values.City,
    region: values.Region,
    country: values.Country,
    latitude: coords.latitude,
    longitude: coords.longitude,
  });
}

export function placeFromIpApi(payload, ip) {
  if (!payload || payload.status !== 'success' || payload.query !== ip) return null;
  return place('ipapi', ip, {
    city: payload.city,
    region: payload.regionName,
    country: payload.country,
    country_code: payload.countryCode,
    latitude: payload.lat,
    longitude: payload.lon,
  });
}

export function placeFromProxyCheck(payload, ip) {
  if (!payload || (payload.status !== 'ok' && payload.status !== 'warning')) return null;
  const row = payload[ip];
  if (!row || typeof row !== 'object') return null;
  const loc = row.location && typeof row.location === 'object' ? row.location : {};
  return place('proxycheck', ip, {
    city: loc.city_name ?? row.city,
    region: loc.region_name ?? row.region,
    country: loc.country_name ?? row.country,
    country_code: loc.country_code ?? row.isocode,
    latitude: loc.latitude ?? row.latitude,
    longitude: loc.longitude ?? row.longitude,
  });
}

function reading(id, source, metric, value, hint, tone, ip, extra) {
  const text = value?.replace(/\s+/g, ' ').trim();
  if (!text || text === '-' || text === '—') return null;
  const item = {
    id,
    source,
    metric,
    value: text,
    hint: (hint ?? '').replace(/\s+/g, ' ').trim(),
    tone,
    href: HREF[source](ip),
  };
  return extra ? { ...item, ...extra } : item;
}

function highBadTone(score, good, warn) {
  if (score <= good) return 'good';
  if (score < warn) return 'warn';
  return 'bad';
}

function highGoodTone(score, good, warn) {
  if (score >= good) return 'good';
  if (score >= warn) return 'warn';
  return 'bad';
}

function yesNo(value) {
  if (typeof value !== 'string') return undefined;
  if (/^yes$/i.test(value.trim())) return true;
  if (/^no$/i.test(value.trim())) return false;
  return undefined;
}

function ownBoolean(object, key) {
  return object && Object.hasOwn(object, key) && typeof object[key] === 'boolean'
    ? object[key]
    : undefined;
}

function ownYesNo(object, key) {
  return object && Object.hasOwn(object, key) ? yesNo(object[key]) : undefined;
}

function knownFlags(flags) {
  return Object.values(flags).some((value) => typeof value === 'boolean');
}

function flagsFromIp2LocationType(value) {
  const flags = {};
  if (!value) return flags;
  if (/^(?:no|none|not detected)$/i.test(value.trim())) {
    // A provider's aggregate "No" answer only says that its proxy
    // classifier found no type. It does not certify every anonymity and
    // hosting field as negative.
    return flags;
  }
  if (/\bVPN\b|Anonymizing VPN/i.test(value)) flags.vpn = true;
  if (/\bTOR\b|Tor/i.test(value)) flags.tor = true;
  if (/RES|residential/i.test(value)) flags.residentialProxy = true;
  if (/PUB|proxy/i.test(value) && !/not a proxy|no proxy/i.test(value)) flags.proxy = true;
  if (/DCH|CDN|hosting|datacenter|data center/i.test(value)) flags.hosting = true;
  return flags;
}

export function parseIp2Location(html, ip) {
  if (typeof html !== 'string' || !mentionsIp(html, ip)) return [];
  const field = (label) => {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = html.match(
      new RegExp(
        `<label[^>]*>\\s*${escaped}\\s*</label>[\\s\\S]{0,240}?<p class="ip-result">([\\s\\S]*?)</p>`,
        'i'
      )
    );
    // Answers may carry icon/link markup (`<i ...></i> No`); keep the text.
    return match?.[1]
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };
  const items = [];
  const usage = field('Usage Type');
  const isp = cleanText(field('ISP'));
  const usageFlags = flagsFromIp2LocationType(usage);
  if (usage)
    items.push(
      reading(
        'ip2location-usage',
        'ip2location',
        'usage',
        usage,
        isp ?? '',
        /DCH|CDN|host/i.test(usage) ? 'warn' : 'neutral',
        ip,
        knownFlags(usageFlags) ? { flags: usageFlags } : undefined
      )
    );
  const proxy = cleanText(field('Proxy Type'));
  const proxyAnswer = cleanText(field('Proxy'));
  const provider = cleanText(field('Provider'));
  const proxyFlags = flagsFromIp2LocationType(proxy ?? proxyAnswer);
  if (yesNo(proxyAnswer) === true && !knownFlags(proxyFlags)) proxyFlags.proxy = true;
  const proxyValue = proxy ?? (yesNo(proxyAnswer) === false ? 'No' : proxyAnswer);
  if (proxyValue || knownFlags(proxyFlags))
    items.push(
      reading(
        'ip2location-proxy',
        'ip2location',
        'proxy',
        proxyValue ?? (proxyFlags.proxy ? 'Yes' : 'No'),
        provider ?? '',
        knownFlags(proxyFlags) &&
          !/^(?:no|none|not detected)$/i.test((proxy ?? proxyAnswer ?? '').trim())
          ? 'warn'
          : 'neutral',
        ip,
        knownFlags(proxyFlags) ? { flags: proxyFlags } : undefined
      )
    );
  const fraud = field('Fraud Score');
  if (fraud && /^\d+$/.test(fraud)) {
    const score = Number(fraud);
    items.push(
      reading(
        'ip2location-fraud',
        'ip2location',
        'fraud',
        fraud,
        '',
        highBadTone(score, 30, 70),
        ip
      )
    );
  }
  return items.filter(Boolean);
}

export function parseIpinfo(html, ip) {
  if (typeof html !== 'string') return [];
  const values = {};
  for (const match of html.matchAll(
    /\{"@type":"PropertyValue","name":"([^"]+)","value":"([^"]*)"\}/g
  ))
    values[match[1]] = match[2];
  if (values['IP Address'] !== ip) return [];
  const flags = {
    vpn: yesNo(values.VPN),
    proxy: yesNo(values.Proxy),
    tor: yesNo(values.Tor),
    relay: yesNo(values.Relay),
    residentialProxy: yesNo(values['Residential Proxy']),
    hosting: yesNo(values.Hosting),
  };
  for (const [key, value] of Object.entries(flags)) {
    if (typeof value !== 'boolean') delete flags[key];
  }
  if (!knownFlags(flags)) return [];
  const hits = [];
  if (flags.vpn) hits.push('VPN');
  if (flags.proxy) hits.push('Proxy');
  if (flags.tor) hits.push('Tor');
  if (flags.relay) hits.push('Relay');
  if (flags.residentialProxy) hits.push('Residential Proxy');
  const value = hits.length ? hits.join(' · ') : 'No';
  const hint = flags.hosting ? 'Hosting' : '';
  return [
    reading(
      'ipinfo-privacy',
      'ipinfo',
      'privacy',
      value,
      hint,
      flags.tor ? 'bad' : hits.length ? 'warn' : flags.hosting ? 'neutral' : 'good',
      ip,
      { flags }
    ),
  ].filter(Boolean);
}

export function parseScamalytics(html, ip) {
  if (typeof html !== 'string' || !mentionsIp(html, ip)) return [];
  const items = [];
  const fraud = html.match(/Fraud Score:\s*(\d+)/i);
  if (fraud) {
    const score = Number(fraud[1]);
    items.push(
      reading(
        'scamalytics-fraud',
        'scamalytics',
        'fraud',
        String(score),
        '',
        highBadTone(score, 19, 60),
        ip
      )
    );
  }
  const flag = (label) => {
    const match = html.match(
      new RegExp(`${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(Yes|No)`, 'i')
    );
    return yesNo(match?.[1]);
  };
  const vpn = flag('Anonymizing VPN');
  const tor = flag('Tor Exit Node');
  const server = flag('Server');
  const pub = flag('Public Proxy');
  const web = flag('Web Proxy');
  const flags = {
    vpn,
    tor,
    proxy: pub === true || web === true ? true : pub === false && web === false ? false : undefined,
    hosting: server,
  };
  for (const [key, value] of Object.entries(flags)) {
    if (typeof value !== 'boolean') delete flags[key];
  }
  const hits = [];
  if (flags.vpn) hits.push('VPN');
  if (flags.tor) hits.push('Tor');
  if (flags.proxy) hits.push('Proxy');
  if (knownFlags(flags))
    items.push(
      reading(
        'scamalytics-proxy',
        'scamalytics',
        'proxy',
        hits.length ? hits.join(' · ') : 'No',
        flags.hosting ? 'Server' : '',
        flags.tor ? 'bad' : hits.length ? 'warn' : flags.hosting ? 'neutral' : 'good',
        ip,
        { flags }
      )
    );
  if (server === true)
    items.push(reading('scamalytics-usage', 'scamalytics', 'usage', 'Server', '', 'warn', ip));
  return items.filter(Boolean);
}

const IPAPI_FIELDS =
  'status,message,query,isp,org,as,asname,mobile,proxy,hosting,country,countryCode,regionName,city,lat,lon';

export function parseIpApi(payload, ip) {
  if (!payload || payload.status !== 'success' || payload.query !== ip) return [];
  const items = [];
  const proxyFlags = {
    anonymous: typeof payload.proxy === 'boolean' ? payload.proxy : undefined,
    hosting: typeof payload.hosting === 'boolean' ? payload.hosting : undefined,
  };
  for (const [key, value] of Object.entries(proxyFlags)) {
    if (typeof value !== 'boolean') delete proxyFlags[key];
  }
  if (typeof payload.proxy === 'boolean')
    items.push(
      reading(
        'ipapi-proxy',
        'ipapi',
        'proxy',
        payload.proxy ? 'Anonymous' : 'No',
        payload.isp ?? '',
        payload.proxy ? 'warn' : 'good',
        ip,
        { flags: proxyFlags }
      )
    );
  if (payload.hosting === true)
    items.push(
      reading('ipapi-usage', 'ipapi', 'usage', 'Data Center', payload.isp ?? '', 'warn', ip, {
        flags: { hosting: true },
      })
    );
  else if (payload.mobile === true)
    items.push(
      reading('ipapi-usage', 'ipapi', 'usage', 'Mobile', payload.isp ?? '', 'neutral', ip)
    );
  return items.filter(Boolean);
}

export function parseProxyCheck(payload, ip) {
  if (!payload || (payload.status !== 'ok' && payload.status !== 'warning')) return [];
  const row = payload[ip];
  if (!row || typeof row !== 'object') return [];
  const det = row.detections;
  const vpn = ownBoolean(det, 'vpn') ?? ownYesNo(row, 'vpn');
  const proxy = ownBoolean(det, 'proxy') ?? ownYesNo(row, 'proxy');
  const tor = ownBoolean(det, 'tor') ?? ownYesNo(row, 'tor');
  const hosting =
    ownBoolean(det, 'hosting') ??
    ownYesNo(row, 'hosting') ??
    (/hosting|datacenter/i.test(row.type ?? '') ? true : undefined);
  const flags = { vpn, proxy, tor, hosting };
  for (const [key, value] of Object.entries(flags)) {
    if (typeof value !== 'boolean') delete flags[key];
  }
  const hits = [];
  if (vpn) hits.push('VPN');
  if (proxy) hits.push('Proxy');
  if (tor) hits.push('Tor');
  const items = [];
  if (knownFlags(flags))
    items.push(
      reading(
        'proxycheck-proxy',
        'proxycheck',
        'proxy',
        hits.length ? hits.join(' · ') : 'No',
        '',
        tor ? 'bad' : hits.length ? 'warn' : hosting ? 'neutral' : 'good',
        ip,
        { flags }
      )
    );
  const usageType = row.network?.type || row.type;
  if (hosting)
    items.push(
      reading('proxycheck-usage', 'proxycheck', 'usage', 'Data Center', usageType ?? '', 'warn', ip)
    );
  else if (usageType)
    items.push(reading('proxycheck-usage', 'proxycheck', 'usage', usageType, '', 'neutral', ip));
  const risk = det && typeof det.risk === 'number' ? det.risk : row.risk;
  if (typeof risk === 'number' && Number.isFinite(risk)) {
    items.push(
      reading(
        'proxycheck-risk',
        'proxycheck',
        'risk',
        String(risk),
        '',
        risk >= 66 ? 'bad' : risk >= 26 ? 'warn' : 'good',
        ip
      )
    );
  }
  return items.filter(Boolean);
}

/**
 * IPPure's page prints 纯净度 as 100 minus their honeypot risk_score
 * (0–59 high risk, 60–79 medium, 80–100 low).
 */
export function parseIppureRisk(payload, ip) {
  const score = payload?.data?.risk_score;
  if (
    payload?.ok !== true ||
    !responseMatchesIp(payload, ip) ||
    typeof score !== 'number' ||
    !Number.isFinite(score)
  )
    return [];
  const purity = Math.round(Math.max(0, Math.min(100, 100 - score)));
  return [
    reading(
      'ippure-purity',
      'ippure',
      'purity',
      String(purity),
      '',
      highGoodTone(purity, 80, 60),
      ip
    ),
  ].filter(Boolean);
}

export function parseIpqs(payload, ip) {
  if (!payload || payload.success !== true || !responseMatchesIp(payload, ip)) return [];
  const items = [];
  const fraud = finiteNumber(payload.fraud_score);
  if (fraud != null)
    items.push(
      reading(
        'ipqs-fraud',
        'ipqs',
        'fraud',
        String(fraud),
        payload.recent_abuse === true ? 'Recent Abuse' : '',
        highBadTone(fraud, 74, 90),
        ip
      )
    );
  const vpn = ownBoolean(payload, 'vpn') ?? ownBoolean(payload, 'active_vpn');
  const proxy = ownBoolean(payload, 'proxy');
  const tor = ownBoolean(payload, 'tor') ?? ownBoolean(payload, 'active_tor');
  const hosting =
    ownBoolean(payload, 'hosting') ??
    (payload.connection_type === 'Data Center' ? true : undefined);
  const flags = { vpn, proxy, tor, hosting };
  for (const [key, value] of Object.entries(flags)) {
    if (typeof value !== 'boolean') delete flags[key];
  }
  const hits = [];
  if (flags.vpn) hits.push('VPN');
  if (flags.proxy) hits.push('Proxy');
  if (flags.tor) hits.push('Tor');
  if (knownFlags(flags))
    items.push(
      reading(
        'ipqs-privacy',
        'ipqs',
        'privacy',
        hits.length ? hits.join(' · ') : 'No',
        '',
        flags.tor ? 'bad' : hits.length ? 'warn' : 'good',
        ip,
        { flags }
      )
    );
  const usage = cleanText(payload.connection_type);
  if (usage)
    items.push(
      reading(
        'ipqs-usage',
        'ipqs',
        'usage',
        usage,
        cleanText(payload.ISP ?? payload.isp) ?? '',
        usage === 'Data Center' ? 'warn' : 'neutral',
        ip
      )
    );
  return items.filter(Boolean);
}

export function placeFromIpqs(payload, ip) {
  if (!payload || payload.success !== true || !responseMatchesIp(payload, ip)) return null;
  return place('ipqs', ip, {
    city: payload.city,
    region: payload.region,
    country: payload.country,
    country_code: payload.country_code,
    latitude: finiteNumber(payload.latitude),
    longitude: finiteNumber(payload.longitude),
  });
}

export function parseAbuseIpdb(payload, ip) {
  const data = payload?.data;
  if (!data || data.ipAddress !== ip) return [];
  const items = [];
  const confidence = finiteNumber(data.abuseConfidenceScore);
  const reports = finiteNumber(data.totalReports);
  if (confidence != null)
    items.push(
      reading(
        'abuseipdb-fraud',
        'abuseipdb',
        'fraud',
        String(confidence),
        reports != null ? `${reports} reports` : '',
        highBadTone(confidence, 15, 50),
        ip
      )
    );
  const usage = cleanText(data.usageType);
  if (usage && !/reserved/i.test(usage))
    items.push(
      reading(
        'abuseipdb-usage',
        'abuseipdb',
        'usage',
        usage,
        cleanText(data.isp) ?? '',
        /data\s*center|hosting|cdn/i.test(usage) ? 'warn' : 'neutral',
        ip
      )
    );
  if (typeof data.isTor === 'boolean')
    items.push(
      reading(
        'abuseipdb-privacy',
        'abuseipdb',
        'privacy',
        data.isTor ? 'Tor' : 'No',
        '',
        data.isTor ? 'bad' : 'good',
        ip,
        { flags: { tor: data.isTor } }
      )
    );
  return items.filter(Boolean);
}

const IPREGISTRY_USAGE_LABEL = {
  business: 'Business',
  isp: 'ISP',
  hosting: 'Hosting',
  education: 'Education',
  government: 'Government',
  cdn: 'CDN',
};

/**
 * ipregistry's security object is flag-only: abuser/attacker/threat are the
 * reputation evidence; vpn/proxy/tor/relay/residential/cloud are the
 * anonymity side. is_anonymous stays an untyped combined flag.
 */
export function parseIpregistry(payload, ip) {
  if (!payload || payload.ip !== ip) return [];
  const security = payload.security && typeof payload.security === 'object' ? payload.security : {};
  const items = [];
  const tor =
    ownBoolean(security, 'is_tor') === true || ownBoolean(security, 'is_tor_exit') === true
      ? true
      : ownBoolean(security, 'is_tor') === false && ownBoolean(security, 'is_tor_exit') === false
        ? false
        : undefined;
  const flags = {
    vpn: ownBoolean(security, 'is_vpn'),
    proxy: ownBoolean(security, 'is_proxy'),
    tor,
    relay: ownBoolean(security, 'is_relay'),
    residentialProxy: ownBoolean(security, 'is_residential_proxy'),
    hosting: ownBoolean(security, 'is_cloud_provider'),
  };
  // is_anonymous is ipregistry's umbrella flag; it only counts as an
  // untyped signal when no typed flag already explains it.
  const anonymous = ownBoolean(security, 'is_anonymous');
  const typedHit =
    flags.vpn === true ||
    flags.proxy === true ||
    flags.tor === true ||
    flags.relay === true ||
    flags.residentialProxy === true;
  if (anonymous === false) flags.anonymous = false;
  else if (anonymous === true && !typedHit) flags.anonymous = true;
  for (const [key, value] of Object.entries(flags)) {
    if (typeof value !== 'boolean') delete flags[key];
  }
  const hits = [];
  if (flags.vpn) hits.push('VPN');
  if (flags.proxy) hits.push('Proxy');
  if (flags.tor) hits.push('Tor');
  if (flags.relay) hits.push('Relay');
  if (flags.residentialProxy) hits.push('Residential Proxy');
  if (knownFlags(flags))
    items.push(
      reading(
        'ipregistry-privacy',
        'ipregistry',
        'privacy',
        hits.length ? hits.join(' · ') : 'No',
        '',
        flags.tor || flags.residentialProxy
          ? 'bad'
          : hits.length || flags.anonymous
            ? 'warn'
            : 'good',
        ip,
        { flags }
      )
    );
  const abuser =
    security.is_abuser === true || security.is_attacker === true || security.is_threat === true
      ? true
      : security.is_abuser === false &&
          security.is_attacker === false &&
          security.is_threat === false
        ? false
        : undefined;
  if (typeof abuser === 'boolean')
    items.push(
      reading(
        'ipregistry-abuse',
        'ipregistry',
        'abuse',
        abuser ? 'Yes' : 'No',
        '',
        abuser ? 'bad' : 'good',
        ip
      )
    );
  const connection =
    payload.connection && typeof payload.connection === 'object' ? payload.connection : {};
  const usage = IPREGISTRY_USAGE_LABEL[String(connection.type ?? '').toLowerCase()];
  if (usage)
    items.push(
      reading(
        'ipregistry-usage',
        'ipregistry',
        'usage',
        usage,
        cleanText(connection.organization ?? connection.domain) ?? '',
        usage === 'Hosting' || usage === 'CDN' ? 'warn' : 'neutral',
        ip
      )
    );
  return items.filter(Boolean);
}

export function placeFromIpregistry(payload, ip) {
  if (!payload || payload.ip !== ip) return null;
  const location = payload.location && typeof payload.location === 'object' ? payload.location : {};
  return place('ipregistry', ip, {
    city: location.city,
    region: location.region?.name,
    country: location.country?.name,
    country_code: location.country?.code,
    latitude: finiteNumber(location.latitude),
    longitude: finiteNumber(location.longitude),
  });
}

/**
 * A configured IPREGISTRY_API_KEY is used as-is. Without one, the lookup
 * page's own demo key serves api.ipregistry.co for any address; on
 * INVALID_API_KEY the homepage is rescraped once for a rotated key.
 */
async function fetchIpregistry(ip, key) {
  const headers = {
    Accept: 'application/json',
    'User-Agent': UA,
    Origin: 'https://ipregistry.co',
    Referer: 'https://ipregistry.co/',
  };
  if (key) return fetchJson(IPREGISTRY_API(ip, key), headers);
  let body = await fetchJson(IPREGISTRY_API(ip, IPREGISTRY_KEY_FALLBACK), headers);
  if (body?.json?.code !== 'INVALID_API_KEY') return body;
  const home = await fetchHtml(IPREGISTRY_HOME);
  const fresh = home?.match(/apiKey=\\?"([a-zA-Z0-9]{10,})\\?"/)?.[1];
  if (!fresh || fresh === IPREGISTRY_KEY_FALLBACK) return body;
  return (await fetchJson(IPREGISTRY_API(ip, fresh), headers)) ?? body;
}

/** A-list answers from open resolvers; 127.255.255.x means the query was refused. */
function dnsblListed(zone, query) {
  const url = `${DOH_URL}?name=${encodeURIComponent(`${query}.${zone}`)}&type=A`;
  return fetchJson(url, {
    Accept: 'application/dns-json',
    'User-Agent': UA,
  }).then((body) => {
    if (!body?.json || body.json.Status !== 0) return undefined;
    const answers = Array.isArray(body.json.Answer) ? body.json.Answer : [];
    return answers.some(
      (answer) =>
        answer.type === 1 &&
        /^127\.0\.0\./.test(answer.data ?? '') &&
        answer.data !== '127.255.255.254' &&
        answer.data !== '127.255.255.255'
    );
  });
}

function mxtoolboxHeaders(key) {
  return {
    Accept: 'application/json',
    Authorization: key,
    'User-Agent': UA,
  };
}

/** MXToolbox Failed rows are listings. Timeouts are unanswered, not clean. */
export function parseMxtoolboxBlacklist(payload, ip) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const argument = cleanText(payload.CommandArgument);
  if (argument && argument !== ip) return null;
  if (!Array.isArray(payload.Failed) || !Array.isArray(payload.Passed)) return null;
  const warnings = Array.isArray(payload.Warnings) ? payload.Warnings : [];
  const answered = payload.Failed.length + payload.Passed.length + warnings.length;
  if (!answered) return null;
  const names = payload.Failed.map((item) => cleanText(item?.Name)).filter(Boolean);
  const listed = payload.Failed.length;
  return {
    items: [
      reading(
        'dnsbl-blocklist',
        'dnsbl',
        'blocklist',
        `${listed}/${answered}`,
        names.join(' · '),
        listed >= 3 ? 'bad' : listed >= 1 ? 'warn' : 'good',
        ip
      ),
    ].filter(Boolean),
  };
}

async function mxtoolboxCanQueryBlacklist(key) {
  const body = await fetchJson(MXTOOLBOX_USAGE, mxtoolboxHeaders(key));
  const usage = body?.json;
  return (
    typeof usage?.NetworkMax === 'number' &&
    typeof usage?.NetworkRequests === 'number' &&
    usage.NetworkRequests < usage.NetworkMax
  );
}

export async function checkDnsbl(ip, key) {
  const token = typeof key === 'string' ? key.trim() : '';
  if (token && isIP(ip) === 4 && (await mxtoolboxCanQueryBlacklist(token))) {
    const body = await fetchJson(MXTOOLBOX_BLACKLIST(ip), mxtoolboxHeaders(token));
    const parsed = parseMxtoolboxBlacklist(body?.json, ip);
    if (parsed) return parsed;
  }
  return checkDnsblZones(ip);
}

async function checkDnsblZones(ip) {
  const query = ip.split('.').reverse().join('.');
  const results = await Promise.all(
    DNSBL_ZONES.map(async ([zone, name]) => ({
      name,
      listed: await dnsblListed(zone, query),
    }))
  );
  // A resolver outage is not a clean verdict; report nothing instead.
  if (results.every((item) => item.listed === undefined)) return { items: [] };
  const answered = results.filter((item) => item.listed !== undefined);
  const listed = answered.filter((item) => item.listed === true);
  return {
    items: [
      reading(
        'dnsbl-blocklist',
        'dnsbl',
        'blocklist',
        `${listed.length}/${answered.length}`,
        listed.map((item) => item.name).join(' · '),
        listed.length >= 3 ? 'bad' : listed.length >= 1 ? 'warn' : 'good',
        ip
      ),
    ].filter(Boolean),
  };
}

export async function checkTorExit(ip) {
  const text = await fetchHtml(TOR_EXIT_LIST);
  if (typeof text !== 'string' || !text.trim()) return { items: [] };
  const listed = new Set(
    text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  ).has(ip);
  return {
    items: [
      reading(
        'torexit-exit',
        'torexit',
        'privacy',
        listed ? 'Tor' : 'No',
        '',
        listed ? 'bad' : 'good',
        ip,
        { flags: { tor: listed } }
      ),
    ].filter(Boolean),
  };
}

async function hmacHex(message, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join(
    ''
  );
}

async function fetchHtml(url) {
  let response;
  try {
    response = await fetch(url, {
      redirect: 'follow',
      headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': UA },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    return null;
  }
  try {
    return await boundedText(response, 400_000);
  } catch {
    return null;
  }
}

async function fetchJson(url, headers) {
  let response;
  try {
    response = await fetch(url, {
      redirect: 'follow',
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  try {
    const text = await boundedText(response, 20_000);
    try {
      return {
        status: response.status,
        headers: response.headers,
        json: JSON.parse(text),
      };
    } catch {
      return { status: response.status, headers: response.headers, json: null };
    }
  } catch {
    return { status: response.status, headers: response.headers, json: null };
  }
}

/** Quota/limit failures are honest "quota" gaps, not generic read errors. */
function quotaReason(body, json) {
  if (body?.status === 429) return 'quota';
  const message = json && typeof json.message === 'string' ? json.message : '';
  const code = json && typeof json.code === 'string' ? json.code : '';
  if (/insufficient credits|rate.?limit|quota|too many/i.test(message)) return 'quota';
  if (/RATE_LIMIT|QUOTA|CREDIT/i.test(code)) return 'quota';
  return undefined;
}

/**
 * IPPure's SPA signs GETs with a server-issued x-k HMAC challenge.
 * Same handshake their lookup page uses; no stored product key.
 */
async function signedJson(url) {
  const headers = {
    Accept: 'application/json',
    'User-Agent': UA,
    Origin: 'https://ippure.com',
    Referer: 'https://ippure.com/',
  };
  const first = await fetchJson(url, headers);
  if (!first) return null;
  const key = first.headers.get('x-k');
  if (!key) return first.json;
  const ts = parseInt(first.headers.get('x-t') || '', 10);
  const timestamp = Number.isFinite(ts) ? ts : Date.now();
  const token = `${timestamp}-${await hmacHex(['GET', url, '', timestamp].join('-'), key)}`;
  const second = await fetchJson(url, {
    ...headers,
    'x-k': key,
    'x-t': token,
  });
  return second?.json ?? null;
}

async function pull(name, task) {
  try {
    const result = await task();
    if (Array.isArray(result)) return { name, items: (result ?? []).filter(Boolean), place: null };
    return {
      name,
      items: (result?.items ?? []).filter(Boolean),
      place: result?.place ?? null,
      reason: result?.reason,
    };
  } catch {
    return { name, items: [], place: null };
  }
}

async function pullPrefix(ip) {
  try {
    const response = await fetch(`https://rdap.org/ip/${encodeURIComponent(ip)}`, {
      redirect: 'follow',
      headers: {
        Accept: 'application/rdap+json, application/json',
        'User-Agent': UA,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const text = await boundedText(response, 200_000);
    return prefixFromRdap(JSON.parse(text));
  } catch {
    return null;
  }
}

/**
 * Public lookup pages, DNSBL zones, the Tor exit list, ipregistry's public
 * lookup key, and IPPure's lookup-page JSON, parsed into labeled readings.
 * Never averaged.
 * IPQS / AbuseIPDB join only when the deployer configures their API keys;
 * unkeyed sources are left out of `unavailable` so the page keeps them
 * as manual check links instead of failed reads.
 */
export async function ipCross(value, origin, env) {
  const ip = publicIp(value);
  const cache = globalThis.caches?.default;
  const keyTag = `${CACHE_VERSION}${env?.IPQS_API_KEY ? '-q' : ''}${env?.ABUSEIPDB_API_KEY ? '-a' : ''}${env?.MXTOOLBOX_API_KEY ? '-m' : ''}`;
  const key = new Request(`${origin}/api/ip/cross/${encodeURIComponent(ip)}?${keyTag}`);
  const cached = await cache?.match(key).catch(() => undefined);
  if (cached) return cached;

  const pulls = [
    pull('ippure', async () => {
      if (isIP(ip) !== 4) return { items: [] };
      let payload = await signedJson(IPPURE_RISK(ip));
      if (payload?.ok !== true) payload = await signedJson(IPPURE_RISK(ip));
      return { items: parseIppureRisk(payload, ip) };
    }),
    pull('ip2location', async () => {
      const html = await fetchHtml(HREF.ip2location(ip));
      return {
        items: parseIp2Location(html, ip),
        place: placeFromIp2Location(html, ip),
      };
    }),
    pull('ipinfo', async () => {
      const html = await fetchHtml(HREF.ipinfo(ip));
      return {
        items: parseIpinfo(html, ip),
        place: placeFromIpinfo(html, ip),
      };
    }),
    pull('ipapi', async () => {
      const href = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=${IPAPI_FIELDS}`;
      const body = await fetchJson(href, {
        Accept: 'application/json',
        'User-Agent': UA,
      });
      return {
        items: parseIpApi(body?.json, ip),
        place: placeFromIpApi(body?.json, ip),
      };
    }),
    pull('proxycheck', async () => {
      const body = await fetchJson(HREF.proxycheck(ip), {
        Accept: 'application/json',
        'User-Agent': UA,
      });
      return {
        items: parseProxyCheck(body?.json, ip),
        place: placeFromProxyCheck(body?.json, ip),
      };
    }),
    pull('scamalytics', async () => parseScamalytics(await fetchHtml(HREF.scamalytics(ip)), ip)),
    pull('dnsbl', async () =>
      isIP(ip) === 4 ? checkDnsbl(ip, env?.MXTOOLBOX_API_KEY) : { items: [] }
    ),
    pull('torexit', async () => (isIP(ip) === 4 ? checkTorExit(ip) : { items: [] })),
    pull('ipregistry', async () => {
      const configured =
        typeof env?.IPREGISTRY_API_KEY === 'string' ? env.IPREGISTRY_API_KEY.trim() : '';
      const body = await fetchIpregistry(ip, configured || undefined);
      return {
        items: parseIpregistry(body?.json, ip),
        place: placeFromIpregistry(body?.json, ip),
        reason: quotaReason(body, body?.json),
      };
    }),
  ];
  if (typeof env?.IPQS_API_KEY === 'string' && env.IPQS_API_KEY.trim())
    pulls.push(
      pull('ipqs', async () => {
        const body = await fetchJson(IPQS_URL(ip, env.IPQS_API_KEY.trim()), {
          Accept: 'application/json',
          'User-Agent': UA,
        });
        return {
          items: parseIpqs(body?.json, ip),
          place: placeFromIpqs(body?.json, ip),
          reason: quotaReason(body, body?.json),
        };
      })
    );
  if (typeof env?.ABUSEIPDB_API_KEY === 'string' && env.ABUSEIPDB_API_KEY.trim())
    pulls.push(
      pull('abuseipdb', async () => {
        const body = await fetchJson(ABUSEIPDB_URL(ip), {
          Accept: 'application/json',
          Key: env.ABUSEIPDB_API_KEY.trim(),
          'User-Agent': UA,
        });
        return {
          items: parseAbuseIpdb(body?.json, ip),
          reason: quotaReason(body, body?.json),
        };
      })
    );

  const [jobs, prefix] = await Promise.all([Promise.all(pulls), pullPrefix(ip)]);

  const readings = jobs
    .flatMap((job) => job.items)
    .filter(Boolean)
    .sort((left, right) => ORDER.indexOf(left.id) - ORDER.indexOf(right.id));
  const places = jobs.map((job) => job.place).filter(Boolean);
  const unavailable = jobs.filter((job) => !job.items.length).map((job) => job.name);
  const unavailableReasons = {};
  for (const job of jobs)
    if (!job.items.length && job.reason) unavailableReasons[job.name] = job.reason;

  const result = Response.json(
    {
      ip,
      checkedAt: new Date().toISOString(),
      readings,
      places,
      unavailable,
      unavailableReasons,
      prefix: prefix ?? null,
    },
    {
      headers: {
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    }
  );
  if (readings.length) await cache?.put(key, result.clone()).catch(() => {});
  return result;
}
