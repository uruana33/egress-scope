import assert from 'node:assert/strict';
import { test } from 'node:test';

import { lookupIp } from '../src/views/ip/api.ts';
import { adaptCoffee } from '../src/views/ip/coffee.ts';
import { describeLookupError } from '../src/views/ip/model/errors.ts';
import { coffeeIpSchema, parseCoffeeIp } from '../src/views/ip/model/schema.ts';

const withFetch = async (handler, run) => {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
};

test('adaptCoffee tolerates a response that carries nothing but an address', () => {
  const result = adaptCoffee({ ip: '203.0.113.9' });
  assert.deepEqual(result.sources, []);
  assert.equal(result.geo.latitude, undefined);
  assert.equal(result.geo.longitude, undefined);
  assert.equal(result.geo.source, 'Net.Coffee');
  assert.equal(result.risk.available, undefined);
});

test('adaptCoffee maps crawler and abuser flags onto the shared risk contract', () => {
  const result = adaptCoffee({
    ip: '203.0.113.9',
    is_crawler: true,
    is_abuser: false,
    is_vpn: true,
    is_proxy: false,
    is_tor: false,
  });
  assert.equal(result.risk.bot_status, true);
  assert.equal(result.risk.recent_abuse, false);
  assert.equal(result.risk.vpn, true);
});

test('adaptCoffee keeps the first source that carries a usable coordinate pair', () => {
  const result = adaptCoffee({
    ip: '203.0.113.9',
    geo_sources: [
      { src: 'a', lat: null, lon: 10 },
      { src: 'b', lat: 20, lon: null },
      { src: 'c', lat: 30, lon: 40 },
    ],
  });
  assert.equal(result.sources.length, 3);
  assert.equal(result.geo.latitude, 30);
  assert.equal(result.geo.longitude, 40);
});

test('lookupIp accepts an IPv6 answer written in a different but equal notation', async () => {
  const data = await withFetch(
    async () => Response.json({ ip: '2001:db8::1', country: 'Testland' }),
    () => lookupIp('2001:0db8:0000:0000:0000:0000:0000:0001')
  );
  assert.equal(data.geo.country, 'Testland');
});

test('lookupIp surfaces the upstream status so callers can grade the failure', async () => {
  await withFetch(
    async () => Response.json({ error: '未收录该地址' }, { status: 404 }),
    async () => {
      const error = await lookupIp('203.0.113.9').then(
        () => null,
        (reason) => reason
      );
      assert.equal(error?.httpStatus, 404);
    }
  );
});

test('a malformed payload is rejected instead of reaching the view layer', () => {
  assert.throws(() => parseCoffeeIp({ ip: '203.0.113.9', trust_score: 'high' }));
  assert.throws(() => parseCoffeeIp({ country: 'Testland' }));
});

test('unknown upstream fields survive validation so new data is not silently dropped', () => {
  const parsed = coffeeIpSchema.parse({ ip: '203.0.113.9', brand_new_field: 42 });
  assert.equal(parsed.brand_new_field, 42);
});

test('an out of range trust score is dropped rather than rendered as a gauge value', () => {
  assert.equal(parseCoffeeIp({ ip: '203.0.113.9', trust_score: 140 }).trust_score, undefined);
  assert.equal(parseCoffeeIp({ ip: '203.0.113.9', trust_score: 61 }).trust_score, 61);
});

test('lookup failures are graded into distinct, actionable outcomes', () => {
  assert.equal(
    describeLookupError(Object.assign(new Error('x'), { httpStatus: 404 })).kind,
    'missing'
  );
  assert.equal(
    describeLookupError(Object.assign(new Error('x'), { httpStatus: 429 })).kind,
    'rate-limited'
  );
  assert.equal(
    describeLookupError(Object.assign(new Error('x'), { httpStatus: 503 })).kind,
    'upstream'
  );
  assert.equal(describeLookupError(new DOMException('t', 'TimeoutError')).kind, 'timeout');
  assert.equal(describeLookupError(new TypeError('Failed to fetch')).kind, 'offline');
  assert.equal(describeLookupError(new Error('anything else')).kind, 'unknown');
  assert.equal(describeLookupError(undefined), null);
});

test('only transient failures are worth retrying', async () => {
  const { shouldRetryLookup } = await import('../src/views/ip/model/errors.ts');
  assert.equal(shouldRetryLookup(0, Object.assign(new Error('x'), { httpStatus: 404 })), false);
  assert.equal(shouldRetryLookup(0, Object.assign(new Error('x'), { httpStatus: 429 })), true);
  assert.equal(shouldRetryLookup(0, Object.assign(new Error('x'), { httpStatus: 500 })), true);
  assert.equal(shouldRetryLookup(2, Object.assign(new Error('x'), { httpStatus: 500 })), false);
});
