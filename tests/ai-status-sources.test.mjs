import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { getAiStatus, parseDeepSeek, parseGemini } from '../public/worker/ai-status.js';

const deepFeed = (state) =>
  `<rss><channel><item><title>API issue</title><guid>event-1</guid><link>https://status.deepseek.com/incidents/1</link><description>&lt;p&gt;&lt;strong&gt;Status:&lt;/strong&gt; ${state}&lt;/p&gt;</description></item></channel></rss>`;
test('DeepSeek RSS reads explicit status and excludes resolved events', () => {
  for (const state of ['resolved', 'scheduled', 'completed', 'cancelled'])
    assert.equal(parseDeepSeek(deepFeed(state)).status.indicator, 'none');
  assert.equal(parseDeepSeek(deepFeed('investigating')).status.indicator, 'minor');
  assert.equal(parseDeepSeek(deepFeed('ongoing')).status.indicator, 'maintenance');
  assert.throws(() => parseDeepSeek('<html>Unavailable</html>'));
  assert.throws(() => parseDeepSeek(deepFeed('unexpected')));
});
test('Gemini uses the latest timestamp, not array order, to determine resolution', () => {
  const row = [
    'test',
    'API unavailable',
    1,
    [
      [4, '', ['200']],
      [1, '', ['100']],
    ],
  ];
  assert.equal(parseGemini([[[row]]]).status.indicator, 'none');
  row[3].push([1, '', ['300']]);
  const result = parseGemini([[[row]]]);
  assert.equal(result.status.indicator, 'minor');
  assert.equal(result.incidents[0].updated_at, new Date(300000).toISOString());
  assert.throws(() => parseGemini({}));
  assert.throws(() => parseGemini([[[['test', 'bad', 1, []]]]]));
});
test('Gemini reads public page identifiers and retries the status API without exposing credentials', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    if (calls === 1) return new Response('AIzaPublicFirst AIzaPublicSecond');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers.Referer, 'https://aistudio.google.com/');
    if (calls === 2) return new Response(null, { status: 403 });
    return Response.json([[[]]]);
  };
  try {
    assert.equal(
      (
        await getAiStatus({
          id: '31',
          page: 'https://aistudio.google.com/status',
          url: 'https://example.com/status',
        })
      ).status.indicator,
      'none'
    );
    assert.equal(calls, 3);
  } finally {
    globalThis.fetch = original;
  }
});
test('browser and Worker share the same verified AI status sources', () => {
  const web = JSON.parse(readFileSync('src/views/status/services.json'));
  const worker = JSON.parse(readFileSync('public/worker/services.json'));
  assert.deepEqual(web, worker);
  for (const id of ['31', '32', '35']) assert.ok(web.find((s) => s.id === id).url);
  assert.equal(web.find((s) => s.id === '35').page, 'https://status.moonshot.cn');
});
test('DeepSeek falls back to reachability evidence when the RSS endpoint is blocked', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls++;
    if (url === 'https://status.deepseek.com/feed.rss') throw new Error('TLS reset');
    // Probing api.deepseek.com (401) and www.deepseek.com (200) are both reachable.
    if (url === 'https://api.deepseek.com/') return new Response(null, { status: 401 });
    assert.equal(url, 'https://www.deepseek.com/');
    return new Response('ok', { status: 200 });
  };
  try {
    const result = await getAiStatus({
      id: '32',
      url: 'https://status.deepseek.com/feed.rss',
      page: 'https://status.deepseek.com',
    });
    assert.equal(result.status.indicator, 'unknown');
    assert.equal(result.evidence.kind, 'reachability');
    assert.match(result.status.description, /未提供官方运行状态/);
    assert.deepEqual(
      result.evidence.endpoints.map((endpoint) => endpoint.httpStatus),
      [401, 200]
    );
    assert.equal(calls, 3);
  } finally {
    globalThis.fetch = original;
  }
});
test('probe-backed services keep transport reachability separate from official health', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls++;
    if (url === 'https://www.doubao.com/') return new Response('ok', { status: 200 });
    assert.equal(url, 'https://ark.cn-beijing.volces.com/');
    return new Response(null, { status: 401 });
  };
  try {
    const result = await getAiStatus({
      id: 'doubao',
      name: '豆包 (Doubao)',
      url: 'https://www.doubao.com/',
      probe: ['https://www.doubao.com/', 'https://ark.cn-beijing.volces.com/'],
    });
    assert.equal(result.status.indicator, 'unknown');
    assert.equal(result.evidence.kind, 'reachability');
    assert.equal(result.evidence.endpoints[0].httpStatus, 200);
    assert.equal(result.evidence.endpoints[1].httpStatus, 401);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = original;
  }
});

test('probe-backed 5xx responses are reported as HTTP evidence, not platform outages', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('upstream error', { status: 503 });
  try {
    const result = await getAiStatus({
      id: 'probe-5xx',
      name: 'Example',
      url: 'https://example.com/',
      probe: ['https://example.com/'],
    });
    assert.equal(result.status.indicator, 'unknown');
    assert.match(result.status.description, /HTTP 503/);
    assert.match(result.status.description, /不能据此判断整个平台故障/);
    assert.equal(result.evidence.endpoints[0].httpStatus, 503);
  } finally {
    globalThis.fetch = original;
  }
});

test('DeepSeek keeps an unknown evidence result when both RSS and fallback probes fail', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url === 'https://status.deepseek.com/feed.rss') throw new Error('RSS unavailable');
    throw new Error('probe unavailable');
  };
  try {
    const result = await getAiStatus({
      id: '32',
      url: 'https://status.deepseek.com/feed.rss',
      page: 'https://status.deepseek.com',
    });
    assert.equal(result.status.indicator, 'unknown');
    assert.match(result.status.description, /端点均不可达/);
    assert.ok(result.evidence.endpoints.every((endpoint) => endpoint.transport === 'failed'));
  } finally {
    globalThis.fetch = original;
  }
});
