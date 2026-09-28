import assert from 'node:assert/strict';
import { test } from 'node:test';

import { identifyPublicService } from '../src/views/ip/model/public-service.ts';

const now = Date.parse('2026-09-19T00:00:00Z');
test('official service identity matches only documented endpoints', () => {
  for (const ip of [
    '1.1.1.1',
    '1.0.0.1',
    '2606:4700:4700::1111',
    '8.8.8.8',
    '8.8.4.4',
    '2001:4860:4860::8888',
    '9.9.9.9',
    '149.112.112.112',
  ]) {
    const record = identifyPublicService(ip, now);
    assert.ok(record?.href.startsWith('https://'));
    assert.ok(record.label.includes('DNS'));
    assert.equal(Object.hasOwn(record, 'score'), false);
    assert.equal(Object.hasOwn(record, 'vpn'), false);
  }
  for (const ip of ['1.1.1.2', '8.8.8.7', '124.126.3.108', '2606:4700:4700::1112'])
    assert.equal(identifyPublicService(ip, now), null);
});
test('strict normalization accepts equivalent IPs but rejects malformed prefixes', () => {
  assert.deepEqual(
    identifyPublicService('2606:4700:4700:0:0:0:0:1111', now),
    identifyPublicService('2606:4700:4700::1111', now)
  );
  assert.deepEqual(
    identifyPublicService('::ffff:1.1.1.1', now),
    identifyPublicService('1.1.1.1', now)
  );
  for (const ip of [
    '2606:4700:4700::1111xyz',
    '2606:4700:4700:1111',
    '1.1.1.1/24',
    '1.1.1.1:443',
    'https://1.1.1.1',
    'constructor',
    '__proto__',
  ])
    assert.equal(identifyPublicService(ip, now), null, ip);
});
test('service records expire and cannot apply before verification', () => {
  const record = identifyPublicService('1.1.1.1', now);
  const verified = Date.parse(record.verifiedAt),
    expiry = Date.parse(record.expiresAt);
  assert.equal(expiry - verified, 180 * 86400000);
  assert.equal(identifyPublicService('1.1.1.1', verified - 1), null);
  assert.ok(identifyPublicService('1.1.1.1', verified));
  assert.ok(identifyPublicService('1.1.1.1', expiry - 1));
  assert.equal(identifyPublicService('1.1.1.1', expiry), null);
  assert.equal(identifyPublicService('1.1.1.1', NaN), null);
  record.href = 'https://example.test/';
  assert.notEqual(identifyPublicService('1.1.1.1', now).href, record.href);
});
