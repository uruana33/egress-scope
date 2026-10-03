import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  mapAbuseFlags,
  mapAbuseIpdbConfidence,
  mapDnsblBlocklist,
  mapIpqsFraud,
} from '../src/views/ip/model/quality-score.ts';
import { assessQuality } from '../src/views/ip/model/quality.ts';

function reading(id, source, metric, value, hint = '', tone = 'neutral') {
  return {
    id,
    source,
    metric,
    value,
    hint,
    tone,
    href: `https://example.test/${source}`,
    flags:
      value === 'No' && (metric === 'privacy' || metric === 'proxy')
        ? source === 'ipapi'
          ? { anonymous: false }
          : source === 'torexit'
            ? { tor: false }
            : { vpn: false, proxy: false, tor: false }
        : undefined,
  };
}

test('223.5.5.5 keeps source scores but exposes residential versus institutional use', () => {
  const result = assessQuality(
    {
      ip: '223.5.5.5',
      trust_score: 97,
      abuser_score: '0.0007 (Low)',
      intelligence: { abuser_level: 'low', abuser_score_raw: '0.0007 (Low)' },
      is_datacenter: false,
      isResidential: true,
      is_vpn: false,
      is_proxy: false,
      is_tor: false,
      is_abuser: false,
      is_mobile: false,
      company_type: 'government',
      company_name: 'Research Institution of Telecom',
      asn_kind: 'mixed',
      isp: 'China Networks Inter-Exchange',
      asn: 4847,
    },
    {
      ip: '223.5.5.5',
      readings: [
        reading('ipinfo-privacy', 'ipinfo', 'privacy', 'No', '', 'good'),
        reading('ip2location-fraud', 'ip2location', 'fraud', '0', '', 'good'),
        reading('ip2location-usage', 'ip2location', 'usage', '(EDU) University/College/School'),
        reading('ipapi-proxy', 'ipapi', 'proxy', 'No', '', 'good'),
        reading('scamalytics-fraud', 'scamalytics', 'fraud', '0', '', 'good'),
        reading('ippure-purity', 'ippure', 'purity', '73', '', 'warn'),
        reading('proxycheck-proxy', 'proxycheck', 'proxy', 'No', '', 'good'),
        reading('proxycheck-usage', 'proxycheck', 'usage', 'Business'),
        reading('proxycheck-risk', 'proxycheck', 'risk', '0', '', 'good'),
        reading('dnsbl-blocklist', 'dnsbl', 'blocklist', '0/30', '', 'good'),
        reading('torexit-exit', 'torexit', 'privacy', 'No', '', 'good'),
        reading('ipregistry-privacy', 'ipregistry', 'privacy', 'No', '', 'good'),
        reading('ipregistry-abuse', 'ipregistry', 'abuse', 'No', '', 'good'),
        reading('ipregistry-usage', 'ipregistry', 'usage', 'ISP'),
      ],
      unavailable: [],
    }
  );

  assert.ok(result.score != null);
  const usage = result.scoreBreakdown.indicators.find((item) => item.key === 'usage');
  // org 68 + org 68 + isp 88 + residential 100 → 81
  assert.equal(Math.round(usage?.score ?? NaN), 81);
  assert.match(result.summary, /用途存在分歧/);
  assert.equal(result.band, 'good');
  assert.equal(result.bandLabel, '比较好');
  assert.equal(result.kind, 'disputed');
  assert.equal(result.scoreReference, false);
  assert.equal(result.sources.filter((item) => item.status === 'outbound').length, 2);
  const ipqs = result.sources.find((item) => item.id === 'ipqs');
  const abuse = result.sources.find((item) => item.id === 'abuseipdb');
  assert.equal(ipqs?.status, 'outbound');
  assert.equal(abuse?.status, 'outbound');
});

test('Coffee abuser rates below 1 do not count as a 0–100 abuse score', () => {
  const result = assessQuality({
    ip: '203.0.113.30',
    trust_score: 97,
    abuser_score: '0.0007 (Low)',
    intelligence: { abuser_level: 'low', abuser_score_raw: '0.0007 (Low)' },
    isResidential: true,
    is_datacenter: false,
    is_vpn: false,
    is_proxy: false,
    is_tor: false,
    is_abuser: false,
  });
  assert.ok(result.score != null);
  assert.equal(result.scoreStatus, 'provisional');
  assert.equal(result.sources.find((source) => source.id === 'coffee').headline.value, '97');
  assert.notEqual(result.scoreBreakdown.cap, 20);
});

test('public-service datacenter is not capped at 60', () => {
  const result = assessQuality({
    ip: '1.1.1.1',
    is_public_service: true,
    is_datacenter: true,
    trust_score: 90,
    isp: 'Cloudflare',
    is_vpn: false,
    is_proxy: false,
    is_tor: false,
  });
  assert.equal(result.kind, 'public-service');
  assert.equal(result.scoreBreakdown.cap, 100);
  assert.ok(result.score != null);
  assert.equal(result.scoreStatus, 'provisional');
  assert.equal(result.scoreReference, true);
});

test('IP-API untyped anonymity cannot trigger the VPN cap', () => {
  const result = assessQuality(
    {
      ip: '203.0.113.40',
      trust_score: 90,
      isResidential: true,
      is_datacenter: false,
      is_vpn: false,
      is_proxy: false,
      is_tor: false,
    },
    {
      ip: '203.0.113.40',
      readings: [
        reading('ipinfo-privacy', 'ipinfo', 'privacy', 'No', '', 'good'),
        reading('ipapi-proxy', 'ipapi', 'proxy', 'Anonymous', '', 'warn'),
        reading('proxycheck-proxy', 'proxycheck', 'proxy', 'No', '', 'good'),
      ],
      unavailable: [],
    }
  );
  assert.ok(result.scoreBreakdown.cap > 40);
  assert.notEqual(result.kind, 'vpn-exit');
});

const NOW = Date.parse('2026-09-18T00:00:00Z');
const FRESH_PREFIX = {
  registeredAt: '2026-08-06T06:36:23.000Z',
  cidr: '203.0.113.0/24',
};
const OLD_PREFIX = {
  registeredAt: '2010-07-14T00:00:00.000Z',
  cidr: '203.0.113.0/24',
};

function residentialIntel(ip) {
  return {
    ip,
    readings: [
      reading('ipinfo-privacy', 'ipinfo', 'privacy', 'No', '', 'good'),
      reading('ip2location-fraud', 'ip2location', 'fraud', '0', '', 'good'),
      reading('ip2location-usage', 'ip2location', 'usage', '(ISP) Fixed Line ISP'),
      reading('ipapi-proxy', 'ipapi', 'proxy', 'No', '', 'good'),
      reading('scamalytics-fraud', 'scamalytics', 'fraud', '0', '', 'good'),
      reading('ippure-purity', 'ippure', 'purity', '73', '', 'warn'),
      reading('proxycheck-proxy', 'proxycheck', 'proxy', 'No', '', 'good'),
      reading('proxycheck-usage', 'proxycheck', 'usage', 'Residential'),
      reading('proxycheck-risk', 'proxycheck', 'risk', '0', '', 'good'),
    ],
    unavailable: [],
  };
}

test('registration age is context only for residential addresses', () => {
  const coffee = {
    ip: '203.0.113.80',
    trust_score: 97,
    abuser_score: '0.0007 (Low)',
    intelligence: { abuser_level: 'low', abuser_score_raw: '0.0007 (Low)' },
    is_datacenter: false,
    isResidential: true,
    is_vpn: false,
    is_proxy: false,
    is_tor: false,
    is_abuser: false,
    is_mobile: false,
  };
  assessQuality(coffee, residentialIntel(coffee.ip), { now: NOW });
  const fresh = assessQuality(
    coffee,
    { ...residentialIntel(coffee.ip), prefix: FRESH_PREFIX },
    { now: NOW }
  );
  const old = assessQuality(
    coffee,
    { ...residentialIntel(coffee.ip), prefix: OLD_PREFIX },
    { now: NOW }
  );
  // Registration age is display context: a fresh prefix scores exactly like
  // an old one; presence of the RDAP record itself is the integrity input.
  assert.equal(fresh.score, old.score);
  assert.doesNotMatch(fresh.freshness?.value ?? '', /\+/);
  assert.match(fresh.freshness?.hint ?? '', /不参与信誉评分/);
});

const DATACENTER_COFFEE = {
  ip: '208.67.220.220',
  trust_score: 85,
  abuser_score: '0 (Very Low)',
  intelligence: { abuser_level: 'low', abuser_score_raw: '0 (Very Low)' },
  is_datacenter: true,
  isResidential: false,
  is_vpn: false,
  is_proxy: false,
  is_tor: false,
  is_abuser: false,
  company_type: 'hosting',
  company_name: 'NTT America, Inc.',
};

test('disputed datacenter votes stay a usage penalty, not a hard 60 ceiling', () => {
  const result = assessQuality(DATACENTER_COFFEE, {
    ip: '208.67.220.220',
    readings: [
      reading('ipinfo-privacy', 'ipinfo', 'privacy', 'No', '', 'good'),
      reading('ip2location-usage', 'ip2location', 'usage', '(DCH) Data Center/Web Hosting/Transit'),
      reading('ip2location-proxy', 'ip2location', 'proxy', 'No', '', 'neutral'),
      reading('ip2location-fraud', 'ip2location', 'fraud', '3', '', 'good'),
      reading('proxycheck-proxy', 'proxycheck', 'proxy', 'No', '', 'good'),
      reading('proxycheck-usage', 'proxycheck', 'usage', 'Business'),
      reading('proxycheck-risk', 'proxycheck', 'risk', '0', '', 'good'),
      reading('dnsbl-blocklist', 'dnsbl', 'blocklist', '0/7', '', 'good'),
      reading('torexit-exit', 'torexit', 'privacy', 'No', '', 'good'),
    ],
    unavailable: [],
  });
  // Coffee + IP2Location vote datacenter but proxycheck votes org:
  // the usage indicator sits mid-scale while the ceiling stays off.
  const usage = result.scoreBreakdown.indicators.find((item) => item.key === 'usage');
  // dc 35 + dc 35 + org 68 → 46
  assert.equal(Math.round(usage?.score ?? NaN), 46);
  assert.equal(result.scoreBreakdown.cap, 100);
  assert.ok(
    result.score != null && result.score > 60,
    `score ${result.score} should not be clamped at 60`
  );
});

test('unanimous datacenter votes drag usage low instead of capping at 60', () => {
  const result = assessQuality(DATACENTER_COFFEE, {
    ip: '208.67.220.220',
    readings: [
      reading('ipinfo-privacy', 'ipinfo', 'privacy', 'No', '', 'good'),
      reading('ip2location-usage', 'ip2location', 'usage', '(DCH) Data Center/Web Hosting/Transit'),
      reading('ip2location-fraud', 'ip2location', 'fraud', '3', '', 'good'),
      reading('proxycheck-proxy', 'proxycheck', 'proxy', 'No', '', 'good'),
      reading('proxycheck-risk', 'proxycheck', 'risk', '0', '', 'good'),
    ],
    unavailable: [],
  });
  const usage = result.scoreBreakdown.indicators.find((item) => item.key === 'usage');
  assert.equal(Math.round(usage?.score ?? NaN), 35);
  assert.equal(result.scoreBreakdown.cap, 100);
  assert.ok(result.score != null && result.score > 60);
});

test('keyed-source reputation readings map through their own bands', () => {
  assert.equal(mapIpqsFraud(50), 92);
  assert.equal(mapIpqsFraud(80), 62);
  assert.equal(mapIpqsFraud(95), 12);
  assert.equal(mapAbuseIpdbConfidence(0), 95);
  assert.equal(mapAbuseIpdbConfidence(20), 70);
  assert.equal(mapAbuseIpdbConfidence(80), 15);
  assert.equal(mapDnsblBlocklist(0, 7), 97);
  assert.equal(mapDnsblBlocklist(1, 30), 75);
  assert.equal(mapDnsblBlocklist(3, 7), 17);
  assert.equal(mapDnsblBlocklist(5, 7), 0);
  assert.equal(mapAbuseFlags(false), 90);
  assert.equal(mapAbuseFlags(true), 25);

  const result = assessQuality(DATACENTER_COFFEE, {
    ip: '208.67.220.220',
    readings: [
      reading('ipinfo-privacy', 'ipinfo', 'privacy', 'No', '', 'good'),
      reading('ipqs-fraud', 'ipqs', 'fraud', '12', '', 'good'),
      reading('ipqs-usage', 'ipqs', 'usage', 'Residential'),
      reading('abuseipdb-fraud', 'abuseipdb', 'fraud', '0', '', 'good'),
      reading('dnsbl-blocklist', 'dnsbl', 'blocklist', '2/7', '', 'warn'),
    ],
    unavailable: [],
  });
  assert.ok(result.evidence.fraud.includes('ipqs'));
  assert.ok(result.evidence.abuse.includes('abuseipdb'));
  assert.ok(result.evidence.abuse.includes('dnsbl'));
  const ipqs = result.sources.find((item) => item.id === 'ipqs');
  assert.equal(ipqs?.status, 'ready');
  assert.equal(ipqs?.headline.value, '12');
});

test('AbuseIPDB confidence does not become an extreme fraud verdict', () => {
  const result = assessQuality(
    {
      ip: '208.67.220.220',
      trust_score: 97,
      is_abuser: false,
      is_vpn: false,
      is_proxy: false,
      is_tor: false,
    },
    {
      ip: '208.67.220.220',
      readings: [reading('abuseipdb-fraud', 'abuseipdb', 'fraud', '100', '20 reports', 'bad')],
      unavailable: [],
    }
  );

  const abuseipdb = result.sources.find((item) => item.id === 'abuseipdb');
  assert.equal(abuseipdb?.extremeFraud, false);
  assert.notEqual(result.kind, 'high-risk');
});

test('blocklist listings surface as card facts and headline', () => {
  const result = assessQuality(DATACENTER_COFFEE, {
    ip: '208.67.220.220',
    readings: [
      reading('ipinfo-privacy', 'ipinfo', 'privacy', 'No', '', 'good'),
      reading('dnsbl-blocklist', 'dnsbl', 'blocklist', '2/7', 'SpamCop · DroneBL', 'warn'),
    ],
    unavailable: [],
  });
  const dnsbl = result.sources.find((item) => item.id === 'dnsbl');
  assert.equal(dnsbl?.status, 'ready');
  assert.equal(dnsbl?.headline.value, '列入 2 个名单');
  assert.ok(dnsbl?.facts.some((item) => item.label === '黑名单 2/7' && item.tone === 'warn'));
  assert.ok(dnsbl?.rows.some((item) => item.label === '黑名单' && /SpamCop/.test(item.value)));
});

test('a recently registered datacenter prefix does not raise the score', () => {
  const result = assessQuality(
    {
      ip: '1.1.1.1',
      is_public_service: true,
      is_datacenter: true,
      trust_score: 90,
      isp: 'Cloudflare',
      is_vpn: false,
      is_proxy: false,
      is_tor: false,
    },
    {
      ip: '1.1.1.1',
      readings: [],
      unavailable: [],
      prefix: FRESH_PREFIX,
    },
    { now: NOW }
  );
  assert.ok(result.score != null);
  assert.equal(result.scoreStatus, 'provisional');
  assert.equal(result.scoreReference, true);
  assert.match(result.freshness?.hint ?? '', /不参与信誉评分/);
  assert.match(result.freshness?.value ?? '', /较新|Newer/);
});

test('score range collapses to a point once every indicator is observed', () => {
  const result = assessQuality(
    {
      ip: '223.5.5.5',
      trust_score: 97,
      abuser_score: '0.0007 (Low)',
      intelligence: { abuser_level: 'low', abuser_score_raw: '0.0007 (Low)' },
      is_datacenter: false,
      isResidential: true,
      is_vpn: false,
      is_proxy: false,
      is_tor: false,
      is_abuser: false,
      is_mobile: false,
      company_type: 'government',
      asn_kind: 'mixed',
      country: 'CN',
      asn: 4847,
    },
    {
      ip: '223.5.5.5',
      readings: [
        reading('ipinfo-privacy', 'ipinfo', 'privacy', 'No', '', 'good'),
        reading('ip2location-fraud', 'ip2location', 'fraud', '0', '', 'good'),
        reading('ip2location-usage', 'ip2location', 'usage', '(EDU) University/College/School'),
        reading('ipapi-proxy', 'ipapi', 'proxy', 'No', '', 'good'),
        reading('scamalytics-fraud', 'scamalytics', 'fraud', '0', '', 'good'),
        reading('ippure-purity', 'ippure', 'purity', '73', '', 'warn'),
        reading('proxycheck-proxy', 'proxycheck', 'proxy', 'No', '', 'good'),
        reading('proxycheck-usage', 'proxycheck', 'usage', 'Business'),
        reading('proxycheck-risk', 'proxycheck', 'risk', '0', '', 'good'),
        reading('dnsbl-blocklist', 'dnsbl', 'blocklist', '0/30', '', 'good'),
        reading('torexit-exit', 'torexit', 'privacy', 'No', '', 'good'),
        reading('ipregistry-privacy', 'ipregistry', 'privacy', 'No', '', 'good'),
        reading('ipregistry-abuse', 'ipregistry', 'abuse', 'No', '', 'good'),
        reading('ipregistry-usage', 'ipregistry', 'usage', 'ISP'),
      ],
      places: [
        { source: 'ipapi', country: 'CN' },
        { source: 'ip2location', country: 'CN' },
      ],
      prefix: {
        registeredAt: '2010-07-14T00:00:00.000Z',
        handle: 'CNCGROUP-CG',
        cidr: '223.5.0.0/16',
      },
      unavailable: [],
    }
  );
  const { range } = result.scoreBreakdown;
  assert.ok(result.score != null);
  assert.ok(range != null);
  assert.equal(range.lo, range.hi);
  assert.equal(range.lo, result.score);
});

test('thin evidence widens the range instead of hiding uncertainty', () => {
  const result = assessQuality({
    ip: '203.0.113.30',
    trust_score: 97,
    isResidential: true,
    is_datacenter: false,
    is_vpn: false,
    is_proxy: false,
    is_tor: false,
    is_abuser: false,
  });
  const { range } = result.scoreBreakdown;
  assert.ok(result.score != null);
  assert.ok(range != null);
  assert.ok(range.lo < range.hi);
  assert.ok(range.lo <= result.score && result.score <= range.hi);
});

test('Tor exit evidence caps both range bounds', () => {
  const result = assessQuality(
    {
      ip: '203.0.113.99',
      trust_score: 80,
      is_datacenter: true,
      is_vpn: false,
      is_proxy: false,
      is_tor: false,
    },
    {
      ip: '203.0.113.99',
      readings: [
        {
          id: 'torexit-exit',
          source: 'torexit',
          metric: 'privacy',
          value: 'Yes',
          hint: '',
          tone: 'bad',
          href: 'https://example.test/torexit',
          flags: { tor: true },
        },
        reading('proxycheck-proxy', 'proxycheck', 'proxy', 'No', '', 'good'),
      ],
      unavailable: [],
    }
  );
  const { range } = result.scoreBreakdown;
  assert.ok(result.score != null && result.score <= 25);
  assert.ok(range != null);
  assert.ok(range.hi <= 25);
  assert.ok(range.lo <= range.hi);
});

test('unrebutted extreme fraud plus external anonymity hit caps at 25', () => {
  const result = assessQuality(
    {
      ip: '208.67.222.222',
      trust_score: 83,
      is_datacenter: true,
      is_vpn: false,
      is_proxy: false,
      is_tor: false,
      asn_kind: 'isp',
    },
    {
      ip: '208.67.222.222',
      readings: [
        reading('ip2location-fraud', 'ip2location', 'fraud', '99', '', 'bad'),
        {
          id: 'ip2location-proxy',
          source: 'ip2location',
          metric: 'proxy',
          value: 'VPN',
          hint: '',
          tone: 'bad',
          href: 'https://example.test/ip2location',
          flags: { vpn: true },
        },
        {
          id: 'ipregistry-privacy',
          source: 'ipregistry',
          metric: 'privacy',
          value: 'VPN',
          hint: '',
          tone: 'bad',
          href: 'https://example.test/ipregistry',
          flags: { vpn: true, anonymous: true },
        },
        reading('dnsbl-blocklist', 'dnsbl', 'blocklist', '0/30', '', 'good'),
        reading('proxycheck-proxy', 'proxycheck', 'proxy', 'No', '', 'good'),
      ],
      unavailable: [],
    }
  );
  const { range } = result.scoreBreakdown;
  assert.equal(result.scoreBreakdown.cap, 25);
  assert.ok(range != null);
  assert.ok(range.hi <= 25);
  assert.ok(range.lo <= result.score && result.score <= range.hi);
});

test('a lone extreme verdict rebutted by clean fraud readings cannot cap', () => {
  const result = assessQuality(
    {
      ip: '208.67.222.222',
      trust_score: 83,
      is_datacenter: true,
      is_vpn: false,
      is_proxy: false,
      is_tor: false,
      asn_kind: 'isp',
    },
    {
      ip: '208.67.222.222',
      readings: [
        reading('ip2location-fraud', 'ip2location', 'fraud', '99', '', 'bad'),
        {
          id: 'ip2location-proxy',
          source: 'ip2location',
          metric: 'proxy',
          value: 'VPN',
          hint: '',
          tone: 'bad',
          href: 'https://example.test/ip2location',
          flags: { vpn: true },
        },
        {
          id: 'ipregistry-privacy',
          source: 'ipregistry',
          metric: 'privacy',
          value: 'VPN',
          hint: '',
          tone: 'bad',
          href: 'https://example.test/ipregistry',
          flags: { vpn: true, anonymous: true },
        },
        reading('scamalytics-fraud', 'scamalytics', 'fraud', '0', '', 'good'),
        reading('ippure-purity', 'ippure', 'purity', '99', '', 'good'),
        reading('dnsbl-blocklist', 'dnsbl', 'blocklist', '0/30', '', 'good'),
        reading('proxycheck-proxy', 'proxycheck', 'proxy', 'No', '', 'good'),
        reading('proxycheck-risk', 'proxycheck', 'risk', '0', '', 'good'),
      ],
      unavailable: [],
    }
  );
  // Two typed hits vs two complete negatives: contested, not consensus.
  // One extreme verdict rebutted by clean fraud readings: no cap, no
  // fraud-anonymity penalty — the indicators carry the signal instead.
  assert.equal(result.scoreBreakdown.cap, 100);
  assert.equal(result.scoreBreakdown.penalties.length, 0);
  assert.ok(result.score != null && result.score > 60);
  assert.notEqual(result.kind, 'high-risk');
});

test('no evidence leaves the score and the range null', () => {
  const result = assessQuality(
    { ip: '192.0.2.1' },
    { ip: '192.0.2.1', readings: [], unavailable: [] }
  );
  assert.equal(result.score, null);
  assert.equal(result.scoreBreakdown.range, null);
});

test('usage-only evidence cannot fabricate a quality range', () => {
  const result = assessQuality(
    { ip: '192.0.2.2' },
    {
      ip: '192.0.2.2',
      readings: [reading('ip2location-usage', 'ip2location', 'usage', 'Business')],
      unavailable: [],
    }
  );
  assert.equal(result.score, null);
  assert.equal(result.scoreBreakdown.range, null);
});
