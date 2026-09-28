import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import worker from '../.worker-test/index.js';

const shell = `<!doctype html><html><head><title>home</title><meta name="description" content="home"><meta property="og:title" content="home"><meta property="og:description" content="home"><meta name="twitter:title" content="home"><meta name="twitter:description" content="home"></head><body><div id="root"></div></body></html>`;

function memoryKv() {
  const store = new Map();
  return {
    store,
    async get(key) {
      return store.has(key) ? store.get(key) : null;
    },
    async put(key, value) {
      store.set(key, String(value));
    },
  };
}

function envWith(kv) {
  return {
    ASSETS: {
      fetch: async () => new Response(shell, { headers: { 'Content-Type': 'text/html' } }),
    },
    API_LIMITER: { limit: async () => ({ success: true }) },
    ACTION_LIMITER: { limit: async () => ({ success: true }) },
    REPORTS: kv,
  };
}

const summary = {
  domestic_ip: '1.1.1.1',
  overseas_ip: '8.8.8.8',
  egress_consistent: false,
  webrtc_match_http: false,
  dns_match_http: true,
  quality_score: 52,
  quality_status: 'moderate',
  asn: 13335,
  isp: 'Cloudflare, Inc.',
  flags: { datacenter: true, vpn: false },
  email: 'hidden@example.com',
};

function postReport(body, headers = {}) {
  return new Request('https://tools.example.com/api/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

test('report API stores a summary snapshot and serves HTML meta', async () => {
  const kv = memoryKv();
  const created = await worker.fetch(
    postReport({
      version: 1,
      client: 'web',
      summary,
      notes: 'forum note',
      fingerprint: { canvas: 'nope' },
      ttl_days: 30,
    }),
    envWith(kv)
  );
  assert.equal(created.status, 200);
  const payload = await created.json();
  assert.match(payload.id, /^r_[0-9A-HJKMNP-TV-Z]{16}$/);
  assert.equal(payload.url, `https://tools.example.com/r/${payload.id}`);
  const ttl = Date.parse(payload.expires_at) - Date.now();
  assert.ok(ttl > 29 * 86400 * 1000 && ttl < 31 * 86400 * 1000);

  const stored = JSON.parse(kv.store.get(payload.id));
  assert.equal(stored.summary.domestic_ip, '1.1.1.1');
  assert.equal(stored.summary.flags.datacenter, true);
  assert.equal(stored.summary.flags.email, undefined);
  assert.equal(stored.fingerprint, undefined);
  assert.equal(stored.notes, 'forum note');
  assert.equal(stored.summary.email, undefined);

  const read = await worker.fetch(
    new Request(`https://tools.example.com/api/report/${payload.id}`, {
      headers: { Origin: 'https://forum.example' },
    }),
    envWith(kv)
  );
  assert.equal(read.status, 200);
  assert.equal(read.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal((await read.json()).summary.quality_score, 52);

  const page = await worker.fetch(
    new Request(`https://tools.example.com/r/${payload.id}`),
    envWith(kv)
  );
  assert.equal(page.status, 200);
  assert.match(page.headers.get('Content-Type'), /text\/html/);
  const html = await page.text();
  assert.match(html, /<title>出口一致性报告 · 一致=否 · 分52 · 出口观测台<\/title>/);
  assert.match(html, /property="og:title" content="出口一致性：国内≠海外 · 质量分 52"/);
  assert.match(
    html,
    /property="og:description" content="WebRTC≠HTTP · DNS=HTTP · ASN13335 · tools\.example\.com"/
  );
  assert.match(html, /property="og:image" content="https:\/\/tools\.example\.com\/og\.png"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(
    html,
    new RegExp(`rel="canonical" href="https://tools\\.example\\.com/r/${payload.id}"`)
  );
  assert.match(html, /id="share-report"/);
  assert.doesNotMatch(html, /hidden@example.com/);
  assert.doesNotMatch(html, /canvas/);
});

test('report creation rejects private data, enforces hourly quota, and degrades without KV', async () => {
  const kv = memoryKv();
  const env = envWith(kv);
  const denied = await worker.fetch(
    postReport({
      version: 1,
      summary: { ...summary, domestic_ip: '10.0.0.1' },
    }),
    env
  );
  assert.equal(denied.status, 400);
  assert.equal(
    [...kv.store.keys()].some((key) => key.startsWith('r_')),
    false
  );

  for (let i = 0; i < 30; i += 1) {
    const response = await worker.fetch(postReport({ version: 1, summary, ttl_days: 7 }), env);
    assert.equal(response.status, 200, `create ${i}`);
  }
  const limited = await worker.fetch(postReport({ version: 1, summary }), env);
  assert.equal(limited.status, 429);

  const blocked = await worker.fetch(
    postReport({ version: 1, summary }, { Origin: 'https://other.example' }),
    env
  );
  assert.equal(blocked.status, 403);

  const missing = await worker.fetch(postReport({ version: 1, summary }), {
    ...env,
    REPORTS: undefined,
  });
  assert.equal(missing.status, 503);

  const absent = await worker.fetch(
    new Request('https://tools.example.com/api/report/r_0123456789ABCDEF'),
    envWith(memoryKv())
  );
  assert.equal(absent.status, 404);
  const page = await worker.fetch(new Request('https://tools.example.com/r/not-a-report'), env);
  assert.equal(page.status, 404);
  assert.match(await page.text(), /name="robots" content="noindex"/);
});

test('sitemap lists dns and share templates but not user reports', async () => {
  const res = await worker.fetch(new Request('https://tools.example.com/sitemap.xml'), envWith());
  assert.equal(res.status, 200);
  const xml = await res.text();
  assert.match(xml, /https:\/\/tools\.example\.com\/dns</);
  assert.match(xml, /https:\/\/tools\.example\.com\/share</);
  assert.match(xml, /https:\/\/tools\.example\.com\/docs\/egress-ip</);
  assert.match(xml, /https:\/\/tools\.example\.com\/docs\/dns-leak</);
  assert.match(xml, /https:\/\/tools\.example\.com\/docs\/clash</);
  assert.doesNotMatch(xml, /\/r\//);
});

test('shipped og.png is a real 1200x630 PNG', () => {
  const png = readFileSync('public/og.png');
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
  const copy = readFileSync('public/assets/og-default.png');
  assert.equal(Buffer.compare(png, copy), 0);
});
