import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  checkDnsbl,
  checkTorExit,
  ipCross,
  parseAbuseIpdb,
  parseIp2Location,
  parseIpApi,
  parseIpinfo,
  parseIppureRisk,
  parseIpqs,
  parseIpregistry,
  parseProxyCheck,
  parseScamalytics,
  placeFromIp2Location,
  placeFromIpApi,
  placeFromIpinfo,
  placeFromIpqs,
  placeFromIpregistry,
  placeFromProxyCheck,
} from '../public/worker/ip-cross.js';
import { prefixFromRdap } from '../public/worker/whois.js';

const IP = '208.67.222.222';

const IP2 = `<html>208.67.222.222
<label class="mb-0">Country</label>
<p class="ip-result"><img src="flag.png">&nbsp;<a>United States of America (US)</a></p>
<label class="mb-0">Region</label>
<p class="ip-result">New York</p>
<label class="mb-0">City</label>
<p class="ip-result">New York City</p>
<label class="mb-0">Coordinates</label>
<p class="ip-result">40.71319, -74.00607</p>
<label class="mb-0">Usage Type</label>
<p class="ip-result">(ISP) Fixed Line ISP</p>
<label class="mb-0">ISP</label>
<p class="ip-result">Comcast Cable Communications</p>
<label class="mb-0">Proxy Type</label>
<p class="ip-result">(VPN) Anonymizing VPN services</p>
<label class="mb-0">Provider</label>
<p class="ip-result">WisdomISP</p>
<label class="mb-0">Fraud Score</label>
<p class="ip-result">99</p>
</html>`;

const IPINFO = `<html>{"@type":"PropertyValue","name":"IP Address","value":"208.67.222.222"}
{"@type":"PropertyValue","name":"City","value":"New York City"}
{"@type":"PropertyValue","name":"Region","value":"New York"}
{"@type":"PropertyValue","name":"Country","value":"United States"}
{"@type":"PropertyValue","name":"Coordinates","value":"40.71427, -74.00597"}
{"@type":"PropertyValue","name":"VPN","value":"No"}
{"@type":"PropertyValue","name":"Proxy","value":"No"}
{"@type":"PropertyValue","name":"Tor","value":"No"}
{"@type":"PropertyValue","name":"Hosting","value":"No"}
</html>`;

const SCAM = `208.67.222.222 Fraud Risk
Fraud Score: 0
Anonymizing VPN Yes`;

test('IP2Location HTML keeps usage, proxy type and fraud on their own polarities', () => {
  const items = parseIp2Location(IP2, IP);
  assert.equal(items.find((item) => item.metric === 'fraud')?.value, '99');
  assert.equal(items.find((item) => item.metric === 'fraud')?.tone, 'bad');
  assert.match(items.find((item) => item.metric === 'proxy')?.value ?? '', /VPN/);
  assert.deepEqual(items.find((item) => item.metric === 'proxy')?.flags, {
    vpn: true,
  });
  assert.equal(items.find((item) => item.metric === 'proxy')?.hint, 'WisdomISP');
  assert.match(items.find((item) => item.metric === 'usage')?.value ?? '', /ISP/);
  assert.match(items.find((item) => item.metric === 'usage')?.hint ?? '', /Comcast/);
  const clean = parseIp2Location(
    `1.1.1.1 <label>Usage Type</label><p class="ip-result">(CDN) Content Delivery Network</p>
     <label>Proxy Type</label><p class="ip-result">-</p>
     <label>Fraud Score</label><p class="ip-result">0</p>`,
    '1.1.1.1'
  );
  assert.equal(clean.find((item) => item.metric === 'fraud')?.value, '0');
  assert.equal(
    clean.find((item) => item.metric === 'proxy'),
    undefined
  );
  assert.deepEqual(clean.find((item) => item.metric === 'usage')?.flags, {
    hosting: true,
  });
  const noProxy = parseIp2Location(
    `1.1.1.1 <label>Proxy Type</label><p class="ip-result">No</p>`,
    '1.1.1.1'
  );
  assert.equal(noProxy.find((item) => item.metric === 'proxy')?.flags, undefined);
});

test('HTML source binding requires an exact IP token', () => {
  const adjacent = `${IP}8 <label>Fraud Score</label><p class="ip-result">99</p>`;
  assert.equal(parseIp2Location(adjacent, IP).length, 0);
  assert.equal(
    placeFromIp2Location(`${IP}8 <label>City</label><p class="ip-result">Wrong City</p>`, IP),
    null
  );

  const ipv6 = '2001:DB8::1';
  const ipv6Html = `${ipv6} <label>Fraud Score</label><p class="ip-result">12</p>`;
  assert.equal(parseIp2Location(ipv6Html, ipv6.toLowerCase()).length, 1);
});

test("IP2Location Proxy field backs a '-' Proxy Type without hiding real flags", () => {
  const dashed = parseIp2Location(
    `${IP} <label>Proxy Type</label><p class="ip-result">-</p>
     <label>Proxy</label><p class="ip-result">No</p>`,
    IP
  );
  const proxy = dashed.find((item) => item.metric === 'proxy');
  assert.equal(proxy?.value, 'No');
  assert.equal(proxy?.flags, undefined);

  const yes = parseIp2Location(
    `${IP} <label>Proxy Type</label><p class="ip-result">-</p>
     <label>Proxy</label><p class="ip-result">Yes</p>`,
    IP
  );
  const hit = yes.find((item) => item.metric === 'proxy');
  assert.equal(hit?.value, 'Yes');
  assert.equal(hit?.tone, 'warn');
  assert.deepEqual(hit?.flags, { proxy: true });

  const typed = parseIp2Location(
    `${IP} <label>Proxy Type</label><p class="ip-result">(DCH) Data Center/Web Hosting/Transit</p>
     <label>Proxy</label><p class="ip-result">No</p>`,
    IP
  );
  assert.deepEqual(typed.find((item) => item.metric === 'proxy')?.flags, {
    hosting: true,
  });
});

test('IP2Location / IPinfo / IP-API / proxycheck expose a comparable city', () => {
  const ip2 = placeFromIp2Location(IP2, IP);
  assert.equal(ip2?.city, 'New York City');
  assert.equal(ip2?.region, 'New York');
  assert.equal(ip2?.country, 'United States of America');
  assert.equal(ip2?.country_code, 'US');
  assert.equal(ip2?.latitude, 40.71319);
  const info = placeFromIpinfo(IPINFO, IP);
  assert.equal(info?.city, 'New York City');
  assert.equal(info?.latitude, 40.71427);
  const api = placeFromIpApi(
    {
      status: 'success',
      query: IP,
      country: 'United States',
      countryCode: 'US',
      regionName: 'New York',
      city: 'New York',
      lat: 40.7128,
      lon: -74.006,
    },
    IP
  );
  assert.equal(api?.city, 'New York');
  assert.equal(api?.region, 'New York');
  const row = placeFromProxyCheck(
    {
      status: 'ok',
      [IP]: {
        location: {
          country_name: 'United States',
          country_code: 'US',
          region_name: 'New York',
          city_name: 'New York',
          latitude: 40.7128,
          longitude: -74.006,
        },
        detections: { proxy: false, vpn: false, risk: 0 },
      },
    },
    IP
  );
  assert.equal(row?.city, 'New York');
  assert.equal(row?.country_code, 'US');
});

test('IP-API JSON keeps proxy and hosting as separate votes, never a blended score', () => {
  const flagged = parseIpApi(
    {
      status: 'success',
      query: IP,
      isp: 'Comcast Cable Communications, LLC',
      proxy: true,
      hosting: false,
      mobile: false,
    },
    IP
  );
  assert.equal(flagged.find((item) => item.metric === 'proxy')?.value, 'Anonymous');
  assert.equal(flagged.find((item) => item.metric === 'proxy')?.tone, 'warn');
  assert.equal(
    flagged.find((item) => item.metric === 'proxy')?.hint,
    'Comcast Cable Communications, LLC'
  );
  assert.equal(
    flagged.find((item) => item.metric === 'usage'),
    undefined
  );
  const hosted = parseIpApi(
    {
      status: 'success',
      query: IP,
      proxy: false,
      hosting: true,
      mobile: false,
    },
    IP
  );
  assert.equal(hosted.find((item) => item.metric === 'proxy')?.value, 'No');
  assert.equal(hosted.find((item) => item.metric === 'usage')?.value, 'Data Center');
  assert.deepEqual(hosted.find((item) => item.metric === 'proxy')?.flags, {
    anonymous: false,
    hosting: true,
  });
  assert.deepEqual(hosted.find((item) => item.metric === 'usage')?.flags, {
    hosting: true,
  });
  assert.equal(parseIpApi({ status: 'success', query: '1.1.1.1', proxy: true }, IP).length, 0);
  assert.equal(parseIpApi({ status: 'fail', message: 'invalid query' }, IP).length, 0);
});

test('IP-API proxy readings carry typed evidence without inventing subtypes', () => {
  const [proxy] = parseIpApi(
    {
      status: 'success',
      query: IP,
      isp: 'Example ISP',
      proxy: true,
    },
    IP
  );
  assert.equal(proxy.value, 'Anonymous');
  assert.deepEqual(proxy.flags, { anonymous: true });

  const [clean] = parseIpApi(
    {
      status: 'success',
      query: IP,
      isp: 'Example ISP',
      proxy: false,
    },
    IP
  );
  assert.equal(clean.value, 'No');
  assert.deepEqual(clean.flags, { anonymous: false });
});

test('proxycheck.io keeps VPN, proxy, usage and risk as separate votes', () => {
  const clean = parseProxyCheck(
    {
      status: 'ok',
      [IP]: {
        network: { type: 'Residential' },
        detections: {
          proxy: false,
          vpn: false,
          tor: false,
          hosting: false,
          risk: 0,
        },
      },
    },
    IP
  );
  assert.equal(clean.find((item) => item.metric === 'proxy')?.value, 'No');
  assert.equal(clean.find((item) => item.metric === 'proxy')?.tone, 'good');
  assert.equal(clean.find((item) => item.metric === 'usage')?.value, 'Residential');
  assert.equal(clean.find((item) => item.metric === 'risk')?.value, '0');
  const flagged = parseProxyCheck(
    {
      status: 'ok',
      [IP]: {
        network: { type: 'Hosting' },
        detections: {
          proxy: true,
          vpn: true,
          tor: true,
          hosting: true,
          risk: 80,
        },
      },
    },
    IP
  );
  assert.equal(flagged.find((item) => item.metric === 'proxy')?.value, 'VPN · Proxy · Tor');
  assert.equal(flagged.find((item) => item.metric === 'proxy')?.tone, 'bad');
  assert.equal(flagged.find((item) => item.metric === 'usage')?.value, 'Data Center');
  assert.equal(flagged.find((item) => item.metric === 'risk')?.value, '80');
  assert.equal(
    parseProxyCheck({ status: 'ok', '1.1.1.1': { detections: { vpn: true } } }, IP).length,
    0
  );
  assert.equal(parseProxyCheck({ status: 'denied', message: 'limit' }, IP).length, 0);
});

test('proxycheck.io keeps missing detection fields unknown', () => {
  const missing = parseProxyCheck({ status: 'ok', [IP]: { detections: {} } }, IP);
  assert.equal(
    missing.find((item) => item.metric === 'proxy'),
    undefined
  );

  const partial = parseProxyCheck({ status: 'ok', [IP]: { detections: { vpn: false } } }, IP);
  const proxy = partial.find((item) => item.metric === 'proxy');
  assert.equal(proxy?.value, 'No');
  assert.deepEqual(proxy?.flags, { vpn: false });
});

test('IPinfo JSON-LD privacy flags stay attached to the queried address', () => {
  const [privacy] = parseIpinfo(IPINFO, IP);
  assert.equal(privacy.value, 'No');
  assert.equal(privacy.tone, 'good');
  assert.deepEqual(privacy.flags, {
    vpn: false,
    proxy: false,
    tor: false,
    hosting: false,
  });
  assert.equal(parseIpinfo(IPINFO, '1.1.1.1').length, 0);
});

test('IPinfo does not turn absent privacy fields into negative evidence', () => {
  const geoOnly = `<html>{"@type":"PropertyValue","name":"IP Address","value":"${IP}"}
{"@type":"PropertyValue","name":"City","value":"New York City"}</html>`;
  assert.equal(parseIpinfo(geoOnly, IP).length, 0);

  const vpnOnly = `<html>{"@type":"PropertyValue","name":"IP Address","value":"${IP}"}
{"@type":"PropertyValue","name":"VPN","value":"No"}</html>`;
  const [privacy] = parseIpinfo(vpnOnly, IP);
  assert.equal(privacy.value, 'No');
  assert.deepEqual(privacy.flags, { vpn: false });
});

test('Scamalytics text reports fraud and VPN separately', () => {
  const items = parseScamalytics(SCAM, IP);
  assert.equal(items.find((item) => item.metric === 'fraud')?.value, '0');
  const proxy = items.find((item) => item.metric === 'proxy');
  assert.equal(proxy?.value, 'VPN');
  assert.deepEqual(proxy?.flags, { vpn: true });
});

test('Scamalytics keeps missing proxy labels unknown', () => {
  const items = parseScamalytics(`${IP} Fraud Risk\nFraud Score: 0`, IP);
  assert.equal(
    items.find((item) => item.metric === 'proxy'),
    undefined
  );
});

test('IPPure 纯净度 is 100 minus their honeypot risk, never Coffee trust', () => {
  const [item] = parseIppureRisk({ ok: true, data: { risk_score: 40 } }, IP);
  assert.equal(item.id, 'ippure-purity');
  assert.equal(item.value, '60');
  assert.equal(item.tone, 'warn');
  assert.equal(item.href, 'https://ippure.com/?ip=208.67.222.222');
  assert.equal(parseIppureRisk({ ok: true, data: { risk_score: 1 } }, IP)[0].value, '99');
  assert.equal(parseIppureRisk({ ok: true, data: { risk_score: 1 } }, IP)[0].tone, 'good');
  assert.equal(parseIppureRisk({ ok: true, data: { risk_score: 50 } }, IP)[0].tone, 'bad');
  assert.equal(parseIppureRisk({ ok: false, data: { risk_score: 1 } }, IP).length, 0);
  assert.equal(parseIppureRisk({ ok: true, data: {} }, IP).length, 0);
  assert.equal(
    parseIppureRisk({ ok: true, data: { ip: '1.1.1.1', risk_score: 40 } }, IP).length,
    0
  );
  assert.equal(
    parseIppureRisk({ ok: true, data: { ip_address: IP, risk_score: 40 } }, IP)[0]?.value,
    '60'
  );
});

test('ipCross gathers whatever pages return and leaves the rest unavailable', async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  globalThis.caches = undefined;
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    if (href.includes('ip2location.io')) return new Response(IP2);
    if (href.includes('ipinfo.io')) return new Response(IPINFO);
    if (href.includes('ip-api.com/json/'))
      return Response.json({
        status: 'success',
        query: IP,
        isp: 'Comcast Cable Communications, LLC',
        proxy: true,
        hosting: false,
        mobile: false,
        country: 'United States',
        countryCode: 'US',
        regionName: 'New York',
        city: 'New York',
        lat: 40.7128,
        lon: -74.006,
      });
    if (href.includes('proxycheck.io/v3/'))
      return Response.json({
        status: 'ok',
        [IP]: {
          network: { type: 'Residential' },
          location: {
            country_name: 'United States',
            country_code: 'US',
            region_name: 'New York',
            city_name: 'New York',
            latitude: 40.7128,
            longitude: -74.006,
          },
          detections: {
            proxy: false,
            vpn: false,
            tor: false,
            hosting: false,
            risk: 0,
          },
        },
      });
    if (href.includes('scamalytics')) return new Response('blocked', { status: 403 });
    if (href.includes('cloudflare-dns.com/dns-query')) return Response.json({ Status: 3 });
    if (href.includes('check.torproject.org')) return new Response('1.2.3.4\n5.6.7.8\n');
    if (href.includes('api.ipregistry.co/'))
      return Response.json({
        ip: IP,
        security: {
          is_abuser: false,
          is_attacker: false,
          is_bogon: false,
          is_cloud_provider: false,
          is_proxy: false,
          is_relay: false,
          is_residential_proxy: false,
          is_tor: false,
          is_tor_exit: false,
          is_vpn: false,
          is_anonymous: false,
          is_threat: false,
        },
        connection: { type: 'isp', organization: 'Comcast Cable' },
        location: {
          city: 'New York',
          region: { name: 'New York' },
          country: { name: 'United States', code: 'US' },
          latitude: 40.7128,
          longitude: -74.006,
        },
      });
    if (href.includes('rdap.org/ip/'))
      return Response.json({
        handle: 'NET-208-67-220-0-1',
        startAddress: '208.67.220.0',
        endAddress: '208.67.223.255',
        cidr0_cidrs: [{ v4prefix: '208.67.220.0', length: 22 }],
        events: [
          {
            eventAction: 'last changed',
            eventDate: '2026-08-06T02:36:23-04:00',
          },
          {
            eventAction: 'registration',
            eventDate: '2026-08-06T02:36:23-04:00',
          },
        ],
      });
    if (href.includes('api.123169.xyz/api/info/ip-risk/')) {
      const headers = new Headers(init?.headers);
      if (headers.get('x-k')) {
        return Response.json({ ok: true, data: { risk_score: 40 } });
      }
      return new Response(JSON.stringify({ ok: false }), {
        headers: {
          'x-k': 'test-key',
          'x-t': '1000',
          'content-type': 'application/json',
        },
      });
    }
    throw new Error(href);
  };
  try {
    const payload = await (await ipCross(IP, 'https://tools.example.com')).json();
    assert.equal(payload.ip, IP);
    assert.match(payload.checkedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.ok(payload.readings.some((item) => item.id === 'ippure-purity'));
    assert.equal(payload.readings.find((item) => item.id === 'ippure-purity')?.value, '60');
    assert.ok(payload.readings.some((item) => item.id === 'ip2location-fraud'));
    assert.ok(payload.readings.some((item) => item.id === 'ipinfo-privacy'));
    assert.ok(payload.readings.some((item) => item.id === 'ipapi-proxy'));
    assert.equal(payload.readings.find((item) => item.id === 'ipapi-proxy')?.value, 'Anonymous');
    assert.ok(payload.readings.some((item) => item.id === 'proxycheck-proxy'));
    assert.equal(payload.readings.find((item) => item.id === 'proxycheck-proxy')?.value, 'No');
    assert.deepEqual(payload.readings.find((item) => item.id === 'proxycheck-proxy')?.flags, {
      vpn: false,
      proxy: false,
      tor: false,
      hosting: false,
    });
    assert.equal(payload.places.length, 5);
    assert.deepEqual(payload.places.map((item) => item.source).sort(), [
      'ip2location',
      'ipapi',
      'ipinfo',
      'ipregistry',
      'proxycheck',
    ]);
    assert.ok(payload.places.every((item) => /new york/i.test(item.city)));
    assert.ok(payload.unavailable.includes('scamalytics'));
    assert.ok(!payload.unavailable.includes('ippure'));
    assert.ok(!payload.readings.some((item) => item.source === 'scamalytics'));
    // Unconfigured API keys never fetch and never count as failed reads.
    assert.ok(!payload.readings.some((item) => item.source === 'ipqs'));
    assert.ok(!payload.readings.some((item) => item.source === 'abuseipdb'));
    assert.ok(!payload.unavailable.includes('ipqs'));
    assert.ok(!payload.unavailable.includes('abuseipdb'));
    assert.ok(payload.unavailable.includes('dnsbl'));
    assert.equal(
      payload.readings.find((item) => item.id === 'dnsbl-blocklist'),
      undefined
    );
    const torexit = payload.readings.find((item) => item.id === 'torexit-exit');
    assert.equal(torexit?.value, 'No');
    assert.deepEqual(torexit?.flags, { tor: false });
    const registry = payload.readings.filter((item) => item.source === 'ipregistry');
    assert.equal(registry.find((item) => item.id === 'ipregistry-abuse')?.value, 'No');
    assert.equal(registry.find((item) => item.id === 'ipregistry-usage')?.value, 'ISP');
    assert.deepEqual(registry.find((item) => item.id === 'ipregistry-privacy')?.flags?.tor, false);
    assert.ok(payload.unavailable.includes('dnsbl'));
    assert.ok(!payload.unavailable.includes('torexit'));
    assert.ok(!payload.unavailable.includes('ipregistry'));
    assert.equal(payload.prefix?.cidr, '208.67.220.0/22');
    assert.equal(payload.prefix?.registeredAt, '2026-08-06T06:36:23.000Z');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalCaches === undefined) delete globalThis.caches;
    else globalThis.caches = originalCaches;
  }
});

test('IPQS keeps fraud, anonymity and usage as separate readings', () => {
  const items = parseIpqs(
    {
      success: true,
      fraud_score: 82,
      vpn: false,
      proxy: false,
      tor: false,
      connection_type: 'Data Center',
      ISP: 'Example Hosting',
      recent_abuse: true,
    },
    IP
  );
  const fraud = items.find((item) => item.id === 'ipqs-fraud');
  assert.equal(fraud?.value, '82');
  assert.equal(fraud?.hint, 'Recent Abuse');
  const privacy = items.find((item) => item.id === 'ipqs-privacy');
  assert.equal(privacy?.value, 'No');
  assert.deepEqual(privacy?.flags, {
    vpn: false,
    proxy: false,
    tor: false,
    hosting: true,
  });
  const usage = items.find((item) => item.id === 'ipqs-usage');
  assert.equal(usage?.value, 'Data Center');
  assert.equal(usage?.tone, 'warn');
  const flagged = parseIpqs(
    { success: true, fraud_score: 91, vpn: true, tor: true, proxy: true },
    IP
  );
  assert.equal(flagged.find((item) => item.id === 'ipqs-privacy')?.value, 'VPN · Proxy · Tor');
  assert.equal(flagged.find((item) => item.id === 'ipqs-privacy')?.tone, 'bad');
  assert.equal(parseIpqs({ success: false }, IP).length, 0);
  const place = placeFromIpqs(
    {
      success: true,
      ipAddress: IP,
      city: 'New York',
      region: 'New York',
      country: 'United States',
      country_code: 'US',
      latitude: 40.7,
      longitude: -74,
    },
    IP
  );
  assert.equal(place?.city, 'New York');
  assert.equal(place?.country_code, 'US');
  assert.equal(parseIpqs({ success: true, ip_address: '1.1.1.1', fraud_score: 99 }, IP).length, 0);
  assert.equal(
    placeFromIpqs(
      {
        success: true,
        query: '1.1.1.1',
        city: 'Wrong City',
      },
      IP
    ),
    null
  );
});

test('AbuseIPDB keeps confidence, reports, usage and Tor separate', () => {
  const items = parseAbuseIpdb(
    {
      data: {
        ipAddress: IP,
        abuseConfidenceScore: 65,
        totalReports: 12,
        usageType: 'Data Center/Web Hosting/Transit',
        isp: 'Example Hosting',
        isTor: false,
      },
    },
    IP
  );
  const fraud = items.find((item) => item.id === 'abuseipdb-fraud');
  assert.equal(fraud?.value, '65');
  assert.equal(fraud?.hint, '12 reports');
  const usage = items.find((item) => item.id === 'abuseipdb-usage');
  assert.equal(usage?.value, 'Data Center/Web Hosting/Transit');
  assert.equal(usage?.tone, 'warn');
  const privacy = items.find((item) => item.id === 'abuseipdb-privacy');
  assert.deepEqual(privacy?.flags, { tor: false });
  assert.equal(parseAbuseIpdb({ data: { ipAddress: '1.1.1.1' } }, IP).length, 0);
  // "Reserved" ranges are not a usage class vote.
  const reserved = parseAbuseIpdb({ data: { ipAddress: IP, usageType: 'Reserved' } }, IP);
  assert.equal(
    reserved.find((item) => item.id === 'abuseipdb-usage'),
    undefined
  );
});

test('DNSBL counts listings per zone and refuses to invent a clean verdict', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      const href = String(url);
      assert.ok(href.startsWith('https://cloudflare-dns.com/dns-query'));
      if (href.includes('bl.spamcop.net') || href.includes('psbl.surriel.com'))
        return Response.json({
          Status: 0,
          Answer: [{ type: 1, data: '127.0.0.2' }],
        });
      return Response.json({ Status: 3 });
    };
    const { items } = await checkDnsbl(IP);
    assert.equal(items[0]?.id, 'dnsbl-blocklist');
    assert.equal(items[0]?.value, '2/2');
    assert.equal(items[0]?.tone, 'warn');
    assert.match(items[0]?.hint, /SpamCop/);
    assert.match(items[0]?.hint, /PSBL/);

    globalThis.fetch = async () => {
      throw new Error('resolver down');
    };
    assert.deepEqual(await checkDnsbl(IP), { items: [] });

    for (const status of [2, 5]) {
      globalThis.fetch = async () =>
        Response.json({
          Status: status,
          Answer: [{ type: 1, data: '127.0.0.2' }],
        });
      assert.deepEqual(await checkDnsbl(IP), { items: [] });
    }

    // 127.255.255.x answers mean the zone refused the query, not a listing.
    globalThis.fetch = async () =>
      Response.json({
        Status: 0,
        Answer: [{ type: 1, data: '127.255.255.254' }],
      });
    const refused = await checkDnsbl(IP);
    assert.equal(refused.items[0]?.value, '0/30');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('MXToolbox blacklist is used only when the account has network quota', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      const href = String(url);
      assert.equal(href.includes('cloudflare-dns.com'), false);
      if (href.endsWith('/Usage')) return Response.json({ NetworkRequests: 0, NetworkMax: 10 });
      assert.match(href, /\/lookup\/blacklist\/208\.67\.222\.222$/);
      return Response.json({
        CommandArgument: IP,
        Failed: [{ Name: 'Spamhaus ZEN' }],
        Passed: [{ Name: 'SpamCop' }, { Name: 'Barracuda' }],
        Warnings: [],
        Timeouts: [{ Name: 'SORBS' }],
      });
    };
    const { items } = await checkDnsbl(IP, 'mx-test-key');
    assert.equal(items[0]?.value, '1/3');
    assert.equal(items[0]?.tone, 'warn');
    assert.equal(items[0]?.hint, 'Spamhaus ZEN');

    globalThis.fetch = async (url) => {
      const href = String(url);
      if (href.endsWith('/Usage')) return Response.json({ NetworkRequests: 0, NetworkMax: 0 });
      if (href.includes('bl.spamcop.net'))
        return Response.json({
          Status: 0,
          Answer: [{ type: 1, data: '127.0.0.2' }],
        });
      if (href.startsWith('https://cloudflare-dns.com/dns-query'))
        return Response.json({ Status: 3 });
      throw new Error(href);
    };
    const fallback = await checkDnsbl(IP, 'mx-test-key');
    assert.equal(fallback.items[0]?.value, '1/1');
    assert.match(fallback.items[0]?.hint, /SpamCop/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Tor bulk exit list only flags addresses it actually contains', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(`${IP}\n1.2.3.4\n`);
    const hit = await checkTorExit(IP);
    assert.equal(hit.items[0]?.value, 'Tor');
    assert.equal(hit.items[0]?.tone, 'bad');
    assert.deepEqual(hit.items[0]?.flags, { tor: true });

    globalThis.fetch = async () => new Response('1.2.3.4\n5.6.7.8\n');
    const clean = await checkTorExit(IP);
    assert.equal(clean.items[0]?.value, 'No');
    assert.deepEqual(clean.items[0]?.flags, { tor: false });

    globalThis.fetch = async () => new Response('down', { status: 503 });
    assert.deepEqual(await checkTorExit(IP), { items: [] });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('configured API keys pull IPQS and AbuseIPDB through the same payload', async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  globalThis.caches = undefined;
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    if (href.includes('ipqualityscore.com/api/json/ip/')) {
      assert.ok(href.includes('/test-ipqs-key/'));
      return Response.json({
        success: true,
        fraud_score: 12,
        vpn: false,
        proxy: false,
        tor: false,
        connection_type: 'Residential',
        city: 'New York',
        country_code: 'US',
      });
    }
    if (href.includes('api.abuseipdb.com')) {
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('Key'), 'test-abuse-key');
      return Response.json({
        data: {
          ipAddress: IP,
          abuseConfidenceScore: 0,
          totalReports: 0,
          usageType: 'Fixed Line ISP',
          isTor: false,
        },
      });
    }
    if (href.includes('api.123169.xyz'))
      return Response.json({ ok: true, data: { risk_score: 5 } });
    if (href.includes('cloudflare-dns.com')) return Response.json({ Status: 3 });
    if (href.includes('check.torproject.org')) return new Response('1.2.3.4\n');
    if (href.includes('rdap.org/ip/')) return Response.json({});
    return new Response('blocked', { status: 403 });
  };
  try {
    const payload = await (
      await ipCross(IP, 'https://tools.example.com', {
        IPQS_API_KEY: 'test-ipqs-key',
        ABUSEIPDB_API_KEY: 'test-abuse-key',
      })
    ).json();
    assert.equal(payload.readings.find((item) => item.id === 'ipqs-fraud')?.value, '12');
    assert.deepEqual(payload.readings.find((item) => item.id === 'ipqs-privacy')?.flags, {
      vpn: false,
      proxy: false,
      tor: false,
    });
    assert.equal(payload.readings.find((item) => item.id === 'abuseipdb-fraud')?.value, '0');
    assert.ok(payload.places.some((item) => item.source === 'ipqs'));
    assert.ok(!payload.unavailable.includes('ipqs'));
    assert.ok(!payload.unavailable.includes('abuseipdb'));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalCaches === undefined) delete globalThis.caches;
    else globalThis.caches = originalCaches;
  }
});

test('an exhausted IPQS quota is disclosed as a quota gap, not a read error', async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  globalThis.caches = undefined;
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.includes('ipqualityscore.com/api/json/ip/')) {
      return Response.json({
        success: false,
        message:
          'You have insufficient credits to make this query. Please contact IPQualityScore support if this error persists.',
        request_id: 'test',
        api_version: 1,
      });
    }
    if (href.includes('api.abuseipdb.com'))
      return Response.json({ errors: [{ detail: 'Daily limit' }] }, { status: 429 });
    if (href.includes('api.123169.xyz'))
      return Response.json({ ok: true, data: { risk_score: 5 } });
    if (href.includes('cloudflare-dns.com')) return Response.json({ Status: 3 });
    if (href.includes('check.torproject.org')) return new Response('1.2.3.4\n');
    if (href.includes('rdap.org/ip/')) return Response.json({});
    return new Response('blocked', { status: 403 });
  };
  try {
    const payload = await (
      await ipCross(IP, 'https://tools.example.com', {
        IPQS_API_KEY: 'test-ipqs-key',
        ABUSEIPDB_API_KEY: 'test-abuse-key',
      })
    ).json();
    assert.ok(payload.unavailable.includes('ipqs'));
    assert.ok(payload.unavailable.includes('abuseipdb'));
    assert.equal(payload.unavailableReasons?.ipqs, 'quota');
    assert.equal(payload.unavailableReasons?.abuseipdb, 'quota');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalCaches === undefined) delete globalThis.caches;
    else globalThis.caches = originalCaches;
  }
});

test('a keyed source that fails reads as unavailable, not outbound', async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  globalThis.caches = undefined;
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.includes('cloudflare-dns.com')) return Response.json({ Status: 3 });
    if (href.includes('check.torproject.org')) return new Response('1.2.3.4\n');
    if (href.includes('rdap.org/ip/')) return Response.json({});
    return new Response('denied', { status: 403 });
  };
  try {
    const payload = await (
      await ipCross(IP, 'https://tools.example.com', {
        IPQS_API_KEY: 'test-ipqs-key',
      })
    ).json();
    assert.ok(payload.unavailable.includes('ipqs'));
    assert.ok(!payload.readings.some((item) => item.source === 'ipqs'));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalCaches === undefined) delete globalThis.caches;
    else globalThis.caches = originalCaches;
  }
});

test('a configured ipregistry key is used verbatim with no homepage rescrape', async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  globalThis.caches = undefined;
  const seen = [];
  globalThis.fetch = async (url) => {
    const href = String(url);
    seen.push(href);
    if (href.includes('api.ipregistry.co/')) return Response.json({ code: 'INVALID_API_KEY' });
    if (href.includes('cloudflare-dns.com')) return Response.json({ Status: 3 });
    if (href.includes('check.torproject.org')) return new Response('1.2.3.4\n');
    if (href.includes('rdap.org/ip/')) return Response.json({});
    return new Response('blocked', { status: 403 });
  };
  try {
    const payload = await (
      await ipCross(IP, 'https://tools.example.com', {
        IPREGISTRY_API_KEY: 'ira_testkey123',
      })
    ).json();
    const apiCalls = seen.filter((href) => href.includes('api.ipregistry.co/'));
    assert.equal(apiCalls.length, 1);
    assert.ok(apiCalls[0].includes('key=ira_testkey123'));
    assert.ok(
      !seen.some((href) => /^https:\/\/ipregistry\.co\/?$/.test(href)),
      'homepage must not be rescraped when a configured key fails'
    );
    assert.ok(payload.unavailable.includes('ipregistry'));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalCaches === undefined) delete globalThis.caches;
    else globalThis.caches = originalCaches;
  }
});

test('IPPure retries the signed handshake once after an ok:false answer', async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  globalThis.caches = undefined;
  let signedCalls = 0;
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    if (href.includes('api.123169.xyz')) {
      const headers = new Headers(init?.headers);
      if (headers.get('x-k')) {
        signedCalls += 1;
        return signedCalls === 1
          ? Response.json({ ok: false })
          : Response.json({ ok: true, data: { risk_score: 5 } });
      }
      return new Response(JSON.stringify({ ok: false }), {
        headers: {
          'x-k': 'test-key',
          'x-t': '1000',
          'content-type': 'application/json',
        },
      });
    }
    if (href.includes('cloudflare-dns.com')) return Response.json({ Status: 3 });
    if (href.includes('check.torproject.org')) return new Response('1.2.3.4\n');
    if (href.includes('rdap.org/ip/')) return Response.json({});
    return new Response('blocked', { status: 403 });
  };
  try {
    const payload = await (await ipCross(IP, 'https://tools.example.com')).json();
    assert.equal(signedCalls, 2);
    assert.equal(payload.readings.find((item) => item.id === 'ippure-purity')?.value, '95');
    assert.ok(!payload.unavailable.includes('ippure'));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalCaches === undefined) delete globalThis.caches;
    else globalThis.caches = originalCaches;
  }
});

test('RDAP prefix age uses registration, not last changed', () => {
  const prefix = prefixFromRdap({
    handle: 'NET-8-8-8-0-2',
    startAddress: '8.8.8.0',
    endAddress: '8.8.8.255',
    cidr0_cidrs: [{ v4prefix: '8.8.8.0', length: 24 }],
    events: [
      { eventAction: 'last changed', eventDate: '2023-12-28T17:24:56-05:00' },
      { eventAction: 'registration', eventDate: '2023-12-28T17:24:33-05:00' },
    ],
  });
  assert.equal(prefix?.registeredAt, '2023-12-28T22:24:33.000Z');
  assert.equal(prefix?.cidr, '8.8.8.0/24');
  assert.equal(
    prefixFromRdap({
      events: [{ eventAction: 'last changed', eventDate: '2026-01-01T00:00:00Z' }],
    }),
    null
  );
});

test('ipregistry splits security flags, abuse marks and connection type', () => {
  const items = parseIpregistry(
    {
      ip: IP,
      security: {
        is_abuser: false,
        is_attacker: true,
        is_bogon: false,
        is_cloud_provider: true,
        is_proxy: true,
        is_relay: false,
        is_residential_proxy: false,
        is_tor: false,
        is_tor_exit: false,
        is_vpn: false,
        is_anonymous: true,
        is_threat: false,
      },
      connection: { type: 'hosting', organization: 'Example Hosting' },
      location: {
        city: 'New York',
        region: { name: 'New York' },
        country: { name: 'United States', code: 'US' },
        latitude: 40.7,
        longitude: -74,
      },
    },
    IP
  );
  const privacy = items.find((item) => item.id === 'ipregistry-privacy');
  assert.equal(privacy?.value, 'Proxy');
  assert.equal(privacy?.tone, 'warn');
  // is_anonymous stays folded into the typed proxy hit, not an extra mark.
  assert.deepEqual(privacy?.flags, {
    vpn: false,
    proxy: true,
    tor: false,
    relay: false,
    residentialProxy: false,
    hosting: true,
  });
  const abuse = items.find((item) => item.id === 'ipregistry-abuse');
  assert.equal(abuse?.value, 'Yes');
  assert.equal(abuse?.tone, 'bad');
  const usage = items.find((item) => item.id === 'ipregistry-usage');
  assert.equal(usage?.value, 'Hosting');
  assert.equal(usage?.hint, 'Example Hosting');
  assert.equal(usage?.tone, 'warn');
});

test('ipregistry is_anonymous alone stays an untyped anonymous hit', () => {
  const items = parseIpregistry(
    {
      ip: IP,
      security: {
        is_abuser: false,
        is_attacker: false,
        is_bogon: false,
        is_cloud_provider: false,
        is_proxy: false,
        is_relay: false,
        is_residential_proxy: false,
        is_tor: false,
        is_tor_exit: false,
        is_vpn: false,
        is_anonymous: true,
        is_threat: false,
      },
      connection: { type: 'business' },
    },
    IP
  );
  const privacy = items.find((item) => item.id === 'ipregistry-privacy');
  assert.equal(privacy?.value, 'No');
  assert.equal(privacy?.flags?.anonymous, true);
  const usage = items.find((item) => item.id === 'ipregistry-usage');
  assert.equal(usage?.value, 'Business');
});

test('ipregistry rejects wrong-IP and key-error payloads', () => {
  assert.deepEqual(parseIpregistry({ code: 'INVALID_API_KEY' }, IP), []);
  assert.deepEqual(parseIpregistry({ ip: '8.8.8.8', security: {} }, IP), []);
  assert.equal(placeFromIpregistry({ ip: '8.8.8.8' }, IP), null);
});

test('ipregistry place uses the location object', () => {
  const place = placeFromIpregistry(
    {
      ip: IP,
      location: {
        city: 'Portland',
        region: { name: 'Oregon' },
        country: { name: 'United States', code: 'US' },
        latitude: 45.51523,
        longitude: -122.67838,
      },
    },
    IP
  );
  assert.equal(place?.source, 'ipregistry');
  assert.equal(place?.city, 'Portland');
  assert.equal(place?.country_code, 'US');
});
