import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ipNetwork } from '../public/worker/ip-network.js';
import { registrationServer } from '../public/worker/whois.js';

test('network details validate all announcing ASNs and preserve no-ROA vs unavailable', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    const data = u.pathname.includes('network-info')
      ? { prefix: '1.1.1.0/24', asns: ['13335', '123'] }
      : u.pathname.includes('reverse-dns')
        ? { result: ['one.one.one.one'] }
        : u.pathname.includes('bgp-state')
          ? {
              query_time: '2026-09-16T00:00:00Z',
              nr_routes: 4,
              bgp_state: [
                {
                  target_prefix: '1.1.1.0/24',
                  path: ['6453', '3356', '13335'],
                },
                {
                  target_prefix: '1.1.1.0/24',
                  path: ['6453', '3356', '13335'],
                },
                {
                  target_prefix: '1.1.1.0/24',
                  path: ['1299', '3356', '13335'],
                },
                {
                  target_prefix: '1.1.1.0/24',
                  path: ['174', '13335'],
                },
              ],
            }
          : u.pathname.includes('as-overview')
            ? { holder: `Holder ${u.searchParams.get('resource')}` }
            : {
                status: u.searchParams.get('resource') === '13335' ? 'valid' : 'unknown',
              };
    return Response.json({ status: 'ok', data });
  };
  try {
    const result = await ipNetwork('1.1.1.1');
    assert.equal(result.ptr, 'one.one.one.one');
    assert.deepEqual(
      result.validations.map((v) => v.status),
      ['valid', 'unknown']
    );
    assert.equal(result.topology.observedPaths, 4);
    assert.deepEqual(
      result.topology.direct.map((item) => [item.asn, item.count]),
      [
        ['3356', 3],
        ['174', 1],
      ]
    );
    assert.equal(result.topology.secondary[0].asn, '6453');
    assert.deepEqual(result.topology.secondary[0].via, ['3356']);
    assert.equal(result.topology.origins[0].name, 'Holder AS13335');
  } finally {
    globalThis.fetch = original;
  }
});
test('RIPE failure returns unavailable without inventing route data', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('offline');
  };
  try {
    const result = await ipNetwork('1.1.1.1');
    assert.equal(result.routeAvailable, false);
    assert.equal(result.prefix, undefined);
    assert.deepEqual(result.validations, []);
  } finally {
    globalThis.fetch = original;
  }
});

test('RDAP bootstrap chooses the longest matching IPv4 or IPv6 registration prefix', () => {
  const services = [
    [['119.0.0.0/8'], ['https://rdap.apnic.net/']],
    [['119.29.0.0/16'], ['https://specific.example/']],
    [['2001:db8::/32'], ['https://v6.example/']],
  ];
  assert.equal(registrationServer('119.29.29.29', services), 'https://specific.example/');
  assert.equal(registrationServer('2001:db8::1', services), 'https://v6.example/');
  assert.equal(registrationServer('8.8.8.8', services), undefined);
});
