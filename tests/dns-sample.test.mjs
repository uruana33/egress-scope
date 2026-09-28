import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  parseDnsResponse,
  parseFastlyEndpoint,
  parseNstoolVars,
  sampleDnsExit,
} from '../src/views/dns-exit/api.ts';

test('DNS samples use unique hosts, bypass cache, and return resolver data', async () => {
  const original = globalThis.fetch;
  const hosts = [];
  globalThis.fetch = async (url, init) => {
    hosts.push(new URL(url).hostname);
    assert.equal(init.cache, 'no-store');
    assert.equal(init.credentials, 'omit');
    assert.ok(init.signal instanceof AbortSignal);
    return Response.json({ '1.1.1.1': { ISP: 'test', IP: '1.1.1.1' } });
  };
  try {
    const signal = new AbortController().signal;
    assert.deepEqual(await sampleDnsExit(signal), {
      ip: '1.1.1.1',
      geo: 'test',
    });
    await sampleDnsExit(signal);
    assert.notEqual(hosts[0], hosts[1]);
    assert.ok(hosts.every((host) => /^[a-f0-9]{10}\.ipv4\.surfsharkdns\.com$/.test(host)));
    globalThis.fetch = async () => Response.json({});
    await assert.rejects(sampleDnsExit(signal), /DNS/);
    const controller = new AbortController();
    globalThis.fetch = async () => {
      controller.abort();
      return Response.json({ '1.1.1.1': { ISP: 'test', IP: '1.1.1.1' } });
    };
    await assert.rejects(sampleDnsExit(controller.signal), {
      name: 'AbortError',
    });
  } finally {
    globalThis.fetch = original;
  }
});

test('DNS resolver parsers normalize public addresses and discard private or malformed values', () => {
  assert.equal(parseFastlyEndpoint({ ip: '2001:0DB8::1', cc: 'US' }), undefined);
  assert.deepEqual(
    parseDnsResponse('Fastly', {
      dns_resolver_info: { ip: '1.1.1.1', cc: 'us', as_name: 'Cloudflare' },
    }),
    [
      {
        ip: '1.1.1.1',
        geo: 'us · Cloudflare',
        country_code: 'US',
      },
    ]
  );
  assert.deepEqual(
    parseDnsResponse('Surfshark', {
      '001.002.003.004': {
        CountryCode: 'US',
        Country: 'US',
        City: 'Test',
        ISP: 'Example',
      },
      '192.168.1.1': {
        Country: 'US',
        City: 'Private',
        ISP: 'Example',
      },
    }),
    [
      {
        ip: '1.2.3.4',
        geo: 'US · Test · Example',
        country_code: 'US',
      },
    ]
  );
});

test('NetEase leaves unknown locations uncoded and preserves explicit overseas countries', () => {
  assert.deepEqual(parseNstoolVars({ dns: '8.8.8.8' }).resolvers, [{ ip: '8.8.8.8', geo: '' }]);
  assert.deepEqual(
    parseNstoolVars({
      dns: '8.8.8.8',
      dns_province: '美国',
      dns_city: '洛杉矶',
      dns_isp: 'Google',
    }).resolvers,
    [
      {
        ip: '8.8.8.8',
        geo: 'US · 美国 · 洛杉矶 · Google',
        country_code: 'US',
      },
    ]
  );
  for (const province of [
    '广西',
    '广西壮族自治区',
    '内蒙古',
    '内蒙古自治区',
    '新疆',
    '新疆维吾尔自治区',
  ]) {
    assert.equal(
      parseNstoolVars({ dns: '8.8.8.8', dns_province: province }).resolvers[0]?.country_code,
      'CN',
      province
    );
  }
  assert.equal(
    parseNstoolVars({
      dns: '8.8.8.8',
      dns_province: '未知（香港节点）',
    }).resolvers[0]?.country_code,
    undefined
  );
  assert.equal(
    parseNstoolVars({ dns: '8.8.8.8', dns_province: '香港' }).resolvers[0]?.country_code,
    'HK'
  );
});
