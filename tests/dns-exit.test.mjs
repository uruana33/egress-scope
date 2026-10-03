import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  detectDnsExits,
  dnsScriptProbe,
  parseDnsClient,
  parseDnsResponse,
} from '../src/views/dns-exit/api.ts';

test('DNS parsers keep resolvers and capture Fastly client IP separately', () => {
  assert.deepEqual(
    parseDnsResponse('Fastly', {
      dns_resolver_info: { ip: '8.8.8.8', cc: 'US', as_name: 'Google' },
      client_ip_info: { ip: '1.2.3.4', cc: 'US', as_name: 'Example' },
    }),
    [{ ip: '8.8.8.8', geo: 'US · Google', country_code: 'US' }]
  );
  assert.deepEqual(
    parseDnsClient('Fastly', {
      dns_resolver_info: { ip: '8.8.8.8', cc: 'US', as_name: 'Google' },
      client_ip_info: { ip: '1.2.3.4', cc: 'US', as_name: 'Example' },
    }),
    { ip: '1.2.3.4', geo: 'US · Example', country_code: 'US' }
  );
  assert.equal(
    parseDnsResponse('BrowserLeaks DNS6', {
      '2001:4860::1': ['US', 'United States', 'Google'],
      '2001:4860::2': ['US', 'United States', 'Google'],
    }).length,
    2
  );
  assert.deepEqual(parseDnsResponse('Surfshark', { '8.8.8.8': { ISP: 'Google', Leak: true } }), [
    { ip: '8.8.8.8', geo: 'Google' },
  ]);
  assert.deepEqual(parseDnsResponse('Fastly', { client_ip_info: { ip: '1.2.3.4' } }), []);
  assert.deepEqual(
    parseDnsResponse('NetEase', {
      ip: '223.6.6.6',
      dns: '180.76.76.76',
      ip_province: '北京市',
      ip_city: '北京市',
      ip_isp: '联通',
      dns_province: '北京市',
      dns_city: '北京市',
      dns_isp: '联通',
    }),
    [{ ip: '180.76.76.76', geo: 'CN · 北京市 · 联通', country_code: 'CN' }]
  );
  assert.deepEqual(
    parseDnsClient('NetEase', {
      ip: '223.6.6.6',
      dns: '180.76.76.76',
      ip_province: '北京市',
      ip_isp: '联通',
    }),
    { ip: '223.6.6.6', geo: 'CN · 北京市 · 联通', country_code: 'CN' }
  );
});

test('multi-source probes merge results, retain failures and use fresh domains', async () => {
  const original = globalThis.fetch;
  const originalScript = dnsScriptProbe.read;
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(url);
    assert.match(new URL(url).hostname.split('.')[0], /^[a-f0-9]{10}$/);
    if (url.includes('dns6.')) throw new Error('unavailable');
    const data = url.includes('fastly')
      ? {
          dns_resolver_info: { ip: '8.8.8.8' },
          client_ip_info: { ip: '1.2.3.4', cc: 'US', as_name: 'Example' },
        }
      : url.includes('surfshark')
        ? { '8.8.8.8': { ISP: 'Google' } }
        : {
            '8.8.8.8': ['US', 'United States', 'Google'],
            '1.1.1.1': ['US', 'United States', 'Cloudflare'],
          };
    return Response.json(data);
  };
  dnsScriptProbe.read = async () => ({
    ip: '223.6.6.6',
    dns: '180.76.76.76',
    ip_province: '北京市',
    ip_isp: '联通',
    dns_province: '北京市',
    dns_isp: '联通',
  });
  try {
    const snapshots = [];
    const result = await detectDnsExits(new AbortController().signal, (s) => snapshots.push(s));
    assert.equal(result.count, 21);
    assert.equal(result.failed, 3);
    assert.equal(result.results.length, 3);
    const google = result.results.find((item) => item.ip === '8.8.8.8');
    assert.equal(google?.samples, 13);
    assert.equal(google?.sources.length, 3);
    const china = result.results.find((item) => item.ip === '180.76.76.76');
    assert.equal(china?.samples, 5);
    assert.deepEqual(china?.sources, ['NetEase']);
    const fastlyClient = result.clients.find((item) => item.ip === '1.2.3.4');
    const nstoolClient = result.clients.find((item) => item.ip === '223.6.6.6');
    assert.equal(fastlyClient?.samples, 5);
    assert.equal(nstoolClient?.samples, 5);
    assert.equal(result.clients.length, 2);
    assert.equal(new Set(urls).size, 16);
    assert.deepEqual(snapshots[0].results, []);
    assert.equal(snapshots.find((s) => s.results.length).results[0].samples, 1);
  } finally {
    globalThis.fetch = original;
    dnsScriptProbe.read = originalScript;
  }
});
