import assert from 'node:assert/strict';
import { test } from 'node:test';

import { detectSiteResult } from '../src/views/home/api.ts';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('diagnostic timing separates queue wait from network time', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    await wait(10);
    return Response.json({ ip: '1.1.1.1' });
  };
  try {
    const results = await Promise.all(
      Array.from({ length: 16 }, (_, index) =>
        detectSiteResult(
          {
            id: `timing-${index}`,
            name: 'Timing source',
            type: 'international',
            method: 'ip-json',
            url: 'https://example.com/ip',
            icon: '',
          },
          'timing-test'
        )
      )
    );
    assert.ok(results.every((result) => result.status === 'ok'));
    assert.ok(results.every((result) => (result.networkMs ?? 0) >= 5));
    assert.ok(Math.max(...results.map((result) => result.queueWaitMs ?? 0)) >= 5);
    for (const result of results) {
      assert.ok(
        Math.abs((result.totalMs ?? 0) - (result.queueWaitMs ?? 0) - (result.networkMs ?? 0)) <= 2
      );
    }
  } finally {
    globalThis.fetch = original;
  }
});

test('link-only sources do not start network work or report network duration', async (t) => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('link-only sources must not fetch'));
  const result = await detectSiteResult(
    {
      id: 'manual-source',
      name: 'Manual',
      type: 'international',
      method: 'unsupported',
      execution: 'link-only',
      icon: '',
    },
    'manual-run'
  );
  assert.equal(result.status, 'unsupported');
  assert.equal(result.execution, 'link-only');
  assert.equal(result.verified, false);
  assert.deepEqual([result.queueWaitMs, result.networkMs, result.totalMs], [0, 0, 0]);
});

const jsonSource = {
  id: 'retry-source',
  name: 'Retry source',
  type: 'international',
  method: 'ip-json',
  url: 'https://example.com/ip',
  icon: '',
};

test('a timeout is retried once without a new user action', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1)
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    return Response.json({ ip: '1.1.1.1' });
  };
  try {
    const result = await detectSiteResult(jsonSource, 'retry-run');
    assert.equal(result.status, 'ok');
    assert.equal(result.ip, '1.1.1.1');
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = original;
  }
});

test('a timeout retry keeps prior network time out of the queue duration', async (t) => {
  const original = globalThis.fetch;
  let calls = 0;
  const clock = [0, 0, 120, 120, 120, 140];
  t.mock.method(performance, 'now', () => clock.shift() ?? 140);
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1)
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    return Response.json({ ip: '1.1.1.1' });
  };
  try {
    const result = await detectSiteResult(jsonSource, 'retry-timing-run');
    assert.equal(result.status, 'ok');
    assert.equal(result.queueWaitMs, 0);
    assert.equal(result.networkMs, 140);
    assert.equal(result.totalMs, 140);
  } finally {
    globalThis.fetch = original;
  }
});

test('a failed timeout retry reports both network attempts', async (t) => {
  const original = globalThis.fetch;
  let calls = 0;
  const clock = [0, 0, 120, 120, 120, 200];
  t.mock.method(performance, 'now', () => clock.shift() ?? 200);
  globalThis.fetch = async () => {
    calls += 1;
    throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
  };
  try {
    const result = await detectSiteResult(jsonSource, 'retry-failed-timing-run');
    assert.equal(result.status, 'timeout');
    assert.equal(result.queueWaitMs, 0);
    assert.equal(result.networkMs, 200);
    assert.equal(result.totalMs, 200);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = original;
  }
});

test('fast network failures are not retried', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new TypeError('Failed to fetch');
  };
  try {
    const result = await detectSiteResult(jsonSource, 'cors-run');
    assert.equal(result.status, 'network_error');
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});
