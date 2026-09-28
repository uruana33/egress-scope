import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assessQuality } from '../src/views/ip/model/quality.ts';

const IP = '74.120.253.118';

const coffeeConflict = {
  ip: IP,
  trust_score: 83,
  abuser_score: '0 (Very Low)',
  intelligence: { abuser_level: 'low', abuser_score_raw: '0 (Very Low)' },
  is_datacenter: true,
  isResidential: false,
  asn_kind: 'residential',
  company_type: 'hosting',
  isp: 'Comcast Cable Communications',
  asn: 33651,
  asOrganization: 'Comcast Cable Communications, LLC',
  is_vpn: false,
  is_proxy: false,
  is_tor: false,
  is_crawler: false,
  is_abuser: false,
  countryCode: 'US',
  registered_country_code: 'US',
};

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
          : { vpn: false, proxy: false, tor: false }
        : undefined,
  };
}

test('a single-source VPN plus Coffee datacenter/residential conflict is 来源存在分歧, not a VPN exit', () => {
  const result = assessQuality(coffeeConflict, {
    ip: IP,
    readings: [
      reading('ipinfo-privacy', 'ipinfo', 'privacy', 'No', '', 'good'),
      reading('ip2location-usage', 'ip2location', 'usage', '(ISP) Fixed Line ISP'),
      reading(
        'ip2location-proxy',
        'ip2location',
        'proxy',
        '(VPN) Anonymizing VPN services',
        'WisdomISP',
        'warn'
      ),
      reading('ip2location-fraud', 'ip2location', 'fraud', '99', '', 'bad'),
    ],
    unavailable: ['scamalytics'],
  });

  assert.equal(result.kind, 'disputed');
  assert.equal(result.kindLabel, '来源存在分歧');
  assert.equal(result.band, 'warn');
  assert.equal(result.bandLabel, '需核实');
  assert.equal(result.network.value, '匿名检测存在分歧');
  assert.equal(result.reputation.value, '信誉偏低');
  assert.equal(result.score, 63);
  assert.equal(result.scoreStatus, 'provisional');
  assert.match(result.summary, /IP2Location 标出 VPN/);
  assert.match(result.summary, /IPinfo 在已检测项目中未检出匿名特征/);
  assert.match(result.summary, /暂不能确认家庭宽带/);
  assert.match(result.network.hint, /服务商名称不等于住宅 IP/);

  const byId = Object.fromEntries(result.sources.map((item) => [item.id, item]));
  const ip2Facts = Object.fromEntries(
    byId.ip2location.facts.map((item) => [item.label, item.tone])
  );
  assert.equal(byId.ip2location.vpn, true);
  assert.equal(byId.ipinfo.vpn, false);
  assert.equal(byId.ipinfo.facts.find((item) => item.tone === 'good')?.label, '已检测项目未检出');
  assert.equal(byId.coffee.vpn, false);
  assert.equal(byId.ip2location.usage, 'isp');
  assert.equal(byId.ping0, undefined);
  assert.equal(ip2Facts['欺诈分 99'], 'bad');
  assert.equal(ip2Facts['(VPN) Anonymizing VPN services'], 'warn');
  assert.equal(ip2Facts.WisdomISP, 'warn');
  assert.equal(byId.coffee.facts.find((item) => item.label === '数据中心')?.tone, 'warn');
  assert.equal(byId.coffee.headline.value, '83');
  assert.equal(byId.coffee.headline.kind, 'score');
  assert.equal(byId.ip2location.headline.value, '99');
  assert.equal(byId.ipinfo.rows.find((item) => item.label === 'VPN')?.value, '否');
  assert.equal(byId.ipqs.headline.value, '去原站');
  assert.ok(byId.ipqs.rows.some((item) => item.label === '欺诈分'));
  assert.equal(byId.ipqs.status, 'outbound');
  assert.equal(byId.abuseipdb.status, 'outbound');
  assert.equal(byId.scamalytics.status, 'unavailable');
  assert.match(byId.ipqs.facts.map((item) => item.label).join(' · '), /Fraud Score/);
  assert.match(byId.abuseipdb.href, /abuseipdb.com\/check\/74.120.253.118/);
});

test('aligned usage can be classified while reputation coverage is incomplete', () => {
  const result = assessQuality(
    {
      ip: '203.0.113.10',
      isResidential: true,
      is_datacenter: false,
      is_vpn: false,
      is_proxy: false,
      is_tor: false,
      is_abuser: false,
      isp: 'AT&T',
      trust_score: 88,
      abuser_score: '0 (Very Low)',
    },
    {
      ip: '203.0.113.10',
      readings: [
        reading('ipinfo-privacy', 'ipinfo', 'privacy', 'No', '', 'good'),
        reading('ip2location-usage', 'ip2location', 'usage', '(ISP) Fixed Line ISP'),
        reading('ip2location-fraud', 'ip2location', 'fraud', '0', '', 'good'),
        reading('scamalytics-fraud', 'scamalytics', 'fraud', '0', '', 'good'),
        reading('scamalytics-proxy', 'scamalytics', 'proxy', 'No', '', 'good'),
      ],
      unavailable: [],
    }
  );
  assert.equal(result.kind, 'residential');
  // Four aligned sources still cover under half of the weighted source
  // budget, so evidence saturation keeps the estimate below "good".
  assert.equal(result.band, 'warn');
  assert.equal(result.kindLabel, '住宅网络特征');
  assert.equal(result.bandLabel, '需核实');
  assert.equal(result.score, 76);
  assert.equal(result.scoreStatus, 'provisional');
  assert.match(result.summary, /未检出匿名特征/);
});

test('two provider VPN hits become a VPN exit rather than a single-source dispute', () => {
  const result = assessQuality(
    {
      ip: '203.0.113.20',
      is_vpn: true,
      is_proxy: false,
      is_tor: false,
      isResidential: true,
    },
    {
      ip: '203.0.113.20',
      readings: [
        reading('ipinfo-privacy', 'ipinfo', 'privacy', 'VPN', '', 'warn'),
        reading('ip2location-proxy', 'ip2location', 'proxy', 'VPN', '', 'warn'),
      ],
      unavailable: [],
    }
  );
  assert.equal(result.kind, 'vpn-exit');
  assert.equal(result.band, 'poor');
  assert.equal(result.kindLabel, 'VPN 出口');
  assert.equal(result.score, 54);
  assert.equal(result.scoreStatus, 'provisional');
  assert.equal(result.scoreBreakdown.reputation, null);
  assert.ok(result.scoreBreakdown.penalties.some((item) => item.key === 'anonymity-consensus'));
  assert.match(result.summary, /标出 VPN/);
});

test('public DNS stays a public service and is not graded as a home line', () => {
  const result = assessQuality({
    ip: '1.1.1.1',
    is_public_service: true,
    is_datacenter: true,
    trust_score: 41,
    isp: 'Cloudflare',
  });
  assert.equal(result.kind, 'public-service');
  assert.equal(result.kindLabel, '公共服务');
  assert.equal(result.band, 'warn');
  assert.equal(result.score, 62);
  assert.equal(result.scoreStatus, 'provisional');
  assert.equal(result.scoreBreakdown.anonymity, null);
  assert.ok(result.scoreBreakdown.cap >= 70);
  assert.match(result.summary, /公共 DNS/);
});

test('Coffee-only results stay pending and still expose outbound IPQS / AbuseIPDB links', () => {
  const result = assessQuality(coffeeConflict, null, { pending: true });
  assert.equal(result.pending, true);
  assert.equal(result.kind, 'disputed');
  const byId = Object.fromEntries(result.sources.map((item) => [item.id, item]));
  assert.equal(byId.coffee.status, 'ready');
  assert.equal(byId.ipinfo.status, 'pending');
  assert.equal(byId.proxycheck.status, 'pending');
  assert.equal(byId.ipqs.status, 'outbound');
  assert.equal(byId.abuseipdb.status, 'outbound');
  assert.equal(byId.skk, undefined);
  assert.equal(byId.whoer, undefined);
  assert.equal(byId.ping0, undefined);
  assert.equal(byId.spur, undefined);
  assert.equal(result.sources.length, 12);
  assert.deepEqual(
    result.sources.filter((item) => item.status === 'outbound').map((item) => item.id),
    ['ipqs', 'abuseipdb']
  );
});

test('numeric source facts remain labelled when missing usage is excluded from an estimate', () => {
  const result = assessQuality(coffeeConflict, {
    ip: IP,
    readings: [
      reading('ip2location-fraud', 'ip2location', 'fraud', '99', '', 'bad'),
      reading('ippure-purity', 'ippure', 'purity', '60', '', 'warn'),
    ],
    unavailable: [],
  });
  assert.equal(result.score, 67);
  assert.equal(result.scoreStatus, 'provisional');
  assert.equal(result.scoreBreakdown.usage, null);
  assert.ok(result.sources.some((item) => item.facts.some((fact) => fact.label === '欺诈分 99')));
  assert.ok(result.sources.some((item) => item.facts.some((fact) => fact.label === '纯净度 60')));
  assert.ok(!result.summary.includes('61'));
});

test('IP-API proxy flag is an untyped anonymous exit, not a VPN vote or fraud score', () => {
  const result = assessQuality(coffeeConflict, {
    ip: IP,
    readings: [reading('ipapi-proxy', 'ipapi', 'proxy', 'Anonymous', 'Comcast', 'warn')],
    unavailable: [],
  });
  const ipapi = result.sources.find((item) => item.id === 'ipapi');
  assert.equal(ipapi?.status, 'ready');
  assert.equal(ipapi?.vpn, null);
  assert.equal(ipapi?.proxy, null);
  assert.equal(ipapi?.untypedAnonymous, true);
  assert.equal(ipapi?.hosting, null);
  assert.equal(ipapi?.facts.find((item) => item.tone === 'warn')?.label, '匿名出口（未分类型）');
  assert.equal(ipapi?.headline.value, '匿名出口（未分类型）');
  assert.equal(ipapi?.rows.find((item) => item.label === '匿名')?.value, '匿名出口（未分类型）');
  assert.ok(!ipapi?.rows.some((item) => item.label === 'VPN'));
  assert.ok(!ipapi?.facts.some((item) => /欺诈分/.test(item.label)));
  assert.equal(result.kind, 'disputed');
  assert.match(result.summary, /IP-API 标出 匿名出口（未分类型）/);
  assert.match(result.summary, /未检出匿名特征/);
});

test('legacy IP-API VPN / Proxy / Tor labels stay untyped so old cache cannot vote VPN', () => {
  const result = assessQuality(coffeeConflict, {
    ip: IP,
    readings: [reading('ipapi-proxy', 'ipapi', 'proxy', 'VPN / Proxy / Tor', 'Comcast', 'warn')],
    unavailable: [],
  });
  const ipapi = result.sources.find((item) => item.id === 'ipapi');
  assert.equal(ipapi?.vpn, null);
  assert.equal(ipapi?.untypedAnonymous, true);
});

test('IP-API does not corroborate a single typed VPN into high-risk when others say no', () => {
  const intel = {
    ip: IP,
    readings: [
      reading('ipinfo-privacy', 'ipinfo', 'privacy', 'No', '', 'good'),
      reading(
        'ip2location-proxy',
        'ip2location',
        'proxy',
        '(VPN) Anonymizing VPN services',
        'WisdomISP',
        'warn'
      ),
      reading('ip2location-fraud', 'ip2location', 'fraud', '99', '', 'bad'),
      reading('ipapi-proxy', 'ipapi', 'proxy', 'Anonymous', 'Comcast', 'warn'),
      reading('proxycheck-proxy', 'proxycheck', 'proxy', 'No', '', 'good'),
    ],
    unavailable: ['scamalytics', 'ippure'],
  };
  const result = assessQuality(coffeeConflict, intel);
  const byId = Object.fromEntries(result.sources.map((item) => [item.id, item]));
  assert.equal(byId.ipqs.vpn, null);
  assert.equal(byId.abuseipdb.vpn, null);
  assert.equal(byId.ipqs.extremeFraud, false);
  assert.equal(byId.ipapi.vpn, null);
  assert.equal(byId.ipapi.untypedAnonymous, true);
  assert.equal(byId.ip2location.vpn, true);
  assert.equal(result.kind, 'disputed');
  assert.equal(result.score, 61);
  assert.equal(result.scoreStatus, 'provisional');
  assert.equal(result.scoreBreakdown.usage, null);
  assert.equal(result.kindLabel, '来源存在分歧');
  assert.equal(result.network.value, '匿名检测存在分歧');
  assert.match(result.summary, /IP2Location 标出 VPN/);
  assert.match(result.summary, /IP-API 标出 匿名出口（未分类型）/);
  assert.match(result.summary, /Net\.Coffee、IPinfo、proxycheck\.io 在已检测项目中未检出匿名特征/);
  assert.equal(result.sourcesReady, 5);
  assert.equal(result.sourcesTotal, 12);
});

test('two typed VPN hits plus extreme fraud are still high-risk without counting IP-API', () => {
  const result = assessQuality(coffeeConflict, {
    ip: IP,
    readings: [
      reading('ipinfo-privacy', 'ipinfo', 'privacy', 'VPN', '', 'warn'),
      reading(
        'ip2location-proxy',
        'ip2location',
        'proxy',
        '(VPN) Anonymizing VPN services',
        'WisdomISP',
        'warn'
      ),
      reading('ip2location-fraud', 'ip2location', 'fraud', '99', '', 'bad'),
      reading('ipapi-proxy', 'ipapi', 'proxy', 'Anonymous', 'Comcast', 'warn'),
    ],
    unavailable: [],
  });
  assert.equal(result.kind, 'high-risk');
  assert.equal(result.score, 25);
  assert.equal(result.scoreStatus, 'provisional');
  assert.equal(result.scoreBreakdown.usage, null);
  assert.equal(result.scoreBreakdown.cap, 25);
  assert.match(result.summary, /IPinfo 标出 VPN.*IP2Location 标出 VPN/);
  assert.doesNotMatch(result.summary, /IP-API 标 VPN/);
});

test('proxycheck.io splits VPN from proxy and does not invent a blended fraud score', () => {
  const result = assessQuality(coffeeConflict, {
    ip: IP,
    readings: [
      reading('proxycheck-proxy', 'proxycheck', 'proxy', 'No', '', 'good'),
      reading('proxycheck-usage', 'proxycheck', 'usage', 'Residential'),
      reading('proxycheck-risk', 'proxycheck', 'risk', '0', '', 'good'),
    ],
    unavailable: [],
  });
  const row = result.sources.find((item) => item.id === 'proxycheck');
  assert.equal(row?.status, 'ready');
  assert.equal(row?.vpn, false);
  assert.equal(row?.proxy, false);
  assert.equal(row?.usage, 'residential');
  assert.equal(row?.elevatedFraud, false);
  assert.ok(row?.facts.some((item) => item.label === '风险分 0'));
  assert.ok(!row?.facts.some((item) => /欺诈分/.test(item.label)));
});

function terminalReading(ip, extra = {}) {
  return {
    ip,
    source: 'text',
    distinctIps: 1,
    capturedAt: '2026-09-17T11:00:00.000Z',
    ...extra,
  };
}

test('matching terminal egress does not vote and only annotates the conclusion', () => {
  const result = assessQuality(coffeeConflict, null, {
    terminal: terminalReading(IP),
    selfLookup: true,
  });
  assert.equal(result.kind, 'disputed');
  assert.equal(result.sourcesTotal, 12);
  assert.equal(result.runtime?.value, '同一出口');
  assert.equal(result.terminalIp, IP);
  assert.match(result.summary, /终端出口与查询地址一致/);
});

test('a different terminal IP does not turn public DNS into a disputed residential line', () => {
  const result = assessQuality(
    {
      ip: '1.1.1.1',
      is_public_service: true,
      is_datacenter: true,
      trust_score: 41,
      isp: 'Cloudflare',
    },
    null,
    { terminal: terminalReading('8.8.8.8'), selfLookup: false }
  );
  assert.equal(result.kind, 'public-service');
  assert.equal(result.runtime?.value, '不同出口');
  assert.equal(result.runtime?.tone, 'warn');
  assert.match(result.summary, /终端出口为 8\.8\.8\.8，不是当前查询地址/);
});

test('self-lookup terminal mismatch says the verdict is only for the browser path', () => {
  const result = assessQuality(coffeeConflict, null, {
    terminal: terminalReading('8.8.8.8'),
    selfLookup: true,
  });
  assert.equal(result.kind, 'disputed');
  assert.match(result.summary, /终端出口为 8\.8\.8\.8，与当前浏览器查询不是同一条路径/);
  assert.match(result.runtime?.hint ?? '', /这份结论只描述当前查询地址/);
});
