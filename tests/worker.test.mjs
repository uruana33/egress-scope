import assert from 'node:assert/strict';
import { test } from 'node:test';

import worker from '../.worker-test/index.js';
import { HttpError, inputJson, publicIp, target, upstream } from '../public/worker/http.js';
import { mapConfig } from '../public/worker/map.js';

const env = {
  APP_ENV: 'prod',
  ASSETS: { fetch: async () => new Response('SPA asset') },
  API_LIMITER: { limit: async () => ({ success: true }) },
  ACTION_LIMITER: { limit: async () => ({ success: true }) },
};
function request(path, init = {}) {
  return new Request(`https://tools.example.com${path}`, init);
}
async function withFetch(fn, run) {
  const original = globalThis.fetch;
  globalThis.fetch = fn;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

test('public IP validation rejects private, fake-IP, expanded IPv6, mapped loopback and documentation ranges', () => {
  for (const ip of [
    '127.0.0.1',
    '10.0.0.1',
    '172.16.0.1',
    '172.31.255.1',
    '192.168.1.1',
    '100.127.0.1',
    '198.18.0.1',
    '169.254.1.1',
    '198.51.100.1',
    '203.0.113.1',
    '0:0:0:0:0:0:0:1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    'fe80::1',
    'fd00::1',
    '2001:db8::1',
    'not-an-ip',
  ])
    assert.throws(() => publicIp(ip), HttpError, ip);
  for (const ip of ['1.1.1.1', '172.32.0.1', '8.8.8.8', '2606:4700:4700::1111'])
    assert.equal(publicIp(ip), ip);
  assert.equal(publicIp('::ffff:8.8.8.8'), '8.8.8.8');
});
test('target validation does not accept URLs, private hosts or ports', () => {
  for (const host of [
    'https://example.com',
    'example.com/path',
    'localhost',
    'foo.local',
    'foo.internal',
    '127.0.0.1',
    'a.com:80',
    'a.com@evil.com',
  ])
    assert.throws(() => target(host));
  assert.equal(target('Example.COM.'), 'example.com');
});
test('request JSON has a strict size limit and rejects invalid shapes', async () => {
  for (const body of ['null', '[]', '{invalid'])
    await assert.rejects(
      () =>
        inputJson(
          request('/api/ping/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
          })
        ),
      (e) => e.status === 400
    );
  await assert.rejects(
    () =>
      inputJson(
        request('/api/ping/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: 'x'.repeat(5000) }),
        })
      ),
    (e) => e.status === 413
  );
});
test('backend source paths are never served', async () => {
  for (const path of ['/worker', '/worker/index.js', '/worker/services.json'])
    assert.equal((await worker.fetch(request(path), env)).status, 404);
  assert.equal(await (await worker.fetch(request('/claude/status.html'), env)).text(), 'SPA asset');
});
test('SEO resources and document metadata bypass the SPA fallback', async () => {
  const robots = await worker.fetch(request('/robots.txt'), env);
  assert.equal(robots.headers.get('Content-Type'), 'text/plain; charset=utf-8');
  assert.match(await robots.text(), /Sitemap: https:\/\/tools\.example\.com\/sitemap\.xml/);

  const sitemap = await worker.fetch(request('/sitemap.xml'), env);
  assert.equal(sitemap.headers.get('Content-Type'), 'application/xml; charset=utf-8');
  assert.match(await sitemap.text(), /<loc>https:\/\/tools\.example\.com\//);

  const html = `<!doctype html><html><head><title>home</title><meta name="description" content="home"><meta property="og:title" content="home"><meta property="og:description" content="home"><meta name="twitter:title" content="home"><meta name="twitter:description" content="home"></head><body></body></html>`;
  const page = await worker.fetch(request('/network/egress'), {
    ...env,
    ASSETS: {
      fetch: async () => new Response(html, { headers: { 'Content-Type': 'text/html' } }),
    },
  });
  const body = await page.text();
  assert.match(body, /<title>分流出口检测 · 网站／DNS／CDN · 出口观测台<\/title>/);
  assert.match(body, /rel="canonical" href="https:\/\/tools\.example\.com\/network\/egress"/);
  assert.match(body, /property="og:url" content="https:\/\/tools\.example\.com\/network\/egress"/);
  assert.match(body, /property="og:image" content="https:\/\/tools\.example\.com\/og\.png"/);
  assert.match(body, /name="twitter:card" content="summary_large_image"/);
  assert.match(body, /name="twitter:image" content="https:\/\/tools\.example\.com\/og\.png"/);
  assert.match(body, /application\/ld\+json/);

  const home = await worker.fetch(request('/'), {
    ...env,
    ASSETS: {
      fetch: async () => new Response(html, { headers: { 'Content-Type': 'text/html' } }),
    },
  });
  const homeBody = await home.text();
  assert.match(homeBody, /<title>出口IP检测 \/ WebRTC \/ DNS \/ IP质量 · 出口观测台<\/title>/);

  for (const [path, title] of [
    ['/dns', 'DNS 泄露与解析出口 · 出口观测台'],
    ['/share', '分享检测报告 · 出口观测台'],
    ['/docs/egress-ip', '出口 IP 检测 · 国内／海外对照 · 出口观测台'],
    ['/docs/dns-leak', 'DNS 泄露检测 · 解析出口 · 出口观测台'],
    ['/docs/clash', 'Clash 健康检查 · 节点出口质量 · 出口观测台'],
  ]) {
    const page = await worker.fetch(request(path), {
      ...env,
      ASSETS: {
        fetch: async () => new Response(html, { headers: { 'Content-Type': 'text/html' } }),
      },
    });
    const text = await page.text();
    assert.match(text, new RegExp(`<title>${title}</title>`));
    assert.match(text, new RegExp(`rel="canonical" href="https://tools\\.example\\.com${path}"`));
  }

  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const image = await worker.fetch(request('/og.png', { method: 'HEAD' }), {
    ...env,
    ASSETS: {
      fetch: async () => new Response(png, { headers: { 'Content-Type': 'image/png' } }),
    },
  });
  assert.equal(image.status, 200);
  assert.match(image.headers.get('Content-Type'), /image\/png/);
  assert.equal(await image.text(), '');

  const spaImage = await worker.fetch(request('/og.png'), {
    ...env,
    ASSETS: {
      fetch: async () => new Response(html, { headers: { 'Content-Type': 'text/html' } }),
    },
  });
  assert.equal(spaImage.status, 404);
  assert.equal(spaImage.headers.get('Content-Type'), 'text/plain; charset=utf-8');
  assert.doesNotMatch(await spaImage.text(), /<html/i);

  const missingAsset = await worker.fetch(request('/assets/old-chunk.js'), {
    ...env,
    ASSETS: {
      fetch: async () => new Response(html, { headers: { 'Content-Type': 'text/html' } }),
    },
  });
  assert.equal(missingAsset.status, 404);
  assert.equal(missingAsset.headers.get('Content-Type'), 'text/plain; charset=utf-8');
});
test('unknown APIs return JSON 404 instead of the SPA', async () => {
  const response = await worker.fetch(request('/api/not-found'), env);
  assert.equal(response.status, 404);
  assert.match(response.headers.get('Content-Type'), /application\/json/);
});
test('map config exposes only the selected public tile provider', async () => {
  assert.deepEqual(mapConfig({}), { provider: 'osm' });
  assert.deepEqual(mapConfig({ TIANDITU_TOKEN: '  test-token  ' }), {
    provider: 'tianditu',
    token: 'test-token',
  });
  const response = await worker.fetch(request('/api/map/config'), {
    ...env,
    TIANDITU_TOKEN: 'test-token',
  });
  assert.deepEqual(await response.json(), {
    provider: 'tianditu',
    token: 'test-token',
  });
});
test('API method and origin checks', async () => {
  assert.equal((await worker.fetch(request('/api/me', { method: 'DELETE' }), env)).status, 405);
  assert.equal((await worker.fetch(request('/api/ping/start'), env)).status, 405);
  assert.equal(
    (await worker.fetch(request('/api/me', { headers: { Origin: 'https://other.example' } }), env))
      .status,
    403
  );
});
test('rate limiting runs before upstream work', async () => {
  const response = await worker.fetch(request('/api/me'), {
    ...env,
    API_LIMITER: { limit: async () => ({ success: false }) },
  });
  assert.equal(response.status, 429);
});
test('local requests never manufacture a visitor IP', async () => {
  assert.equal((await worker.fetch(request('/api/me'), env)).status, 503);
  const response = await worker.fetch(
    request('/api/me', { headers: { 'CF-Connecting-IP': '1.1.1.1' } }),
    { ...env, LOCAL_DEV: 'true' }
  );
  assert.equal(response.status, 503);
});
test('visitor information uses this request only and is not cacheable', async () => {
  for (const ip of ['1.1.1.1', '8.8.8.8']) {
    const req = request('/api/me', { headers: { 'CF-Connecting-IP': ip } });
    Object.defineProperty(req, 'cf', {
      value: { country: 'US', city: 'Test city', asn: 13335 },
    });
    const response = await worker.fetch(req, env);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal((await response.json()).ip, ip);
  }
});

test('WebRTC reports validate candidates and compare them with the request IP', async () => {
  const body = {
    probeId: '12345678-1234-4abc-8def-123456789012',
    baselineIp: '1.1.1.1',
    candidates: [
      {
        ip: '8.8.8.8',
        type: 'srflx',
        endpoint: 'stun:stun.example.com:3478',
        port: 42000,
        protocol: 'udp',
      },
      {
        ip: '192.168.1.2',
        type: 'host',
        endpoint: 'stun:stun.example.com:3478',
        port: 5000,
        protocol: 'udp',
      },
    ],
  };
  const response = await worker.fetch(
    request('/api/webrtc/report', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '1.1.1.1',
      },
      body: JSON.stringify(body),
    }),
    env
  );
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result.leakIps, ['8.8.8.8']);
  assert.equal(result.udpBlocked, false);
  assert.equal(result.candidateCount, 2);
});

test('WebRTC report compares leak addresses within the same IP family', async () => {
  const response = await worker.fetch(
    request('/api/webrtc/report', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '1.1.1.1',
      },
      body: JSON.stringify({
        probeId: '12345678-1234-4abc-8def-123456789012',
        candidates: [
          {
            ip: '2001:4860:4860::8888',
            type: 'srflx',
            endpoint: 'stun:stun.example.com:3478',
            port: 42000,
            protocol: 'udp',
          },
        ],
      }),
    }),
    env
  );
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result.leakIps, []);
  assert.equal(result.splitTunnel, false);
});
function resetEdgeMemory() {
  const store = globalThis.__egressScopeCache;
  if (!store) return;
  for (const bucket of [store.status, store.inflight, store.cross, store.type]) bucket?.clear();
}

test('status API reuses a fresh result without the Cache API', async () => {
  const originalCaches = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  let matches = 0;
  let puts = 0;
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: {
      default: {
        match: async () => {
          matches += 1;
          return undefined;
        },
        put: async () => {
          puts += 1;
        },
      },
    },
  });
  let calls = 0;
  resetEdgeMemory();
  try {
    await withFetch(
      async (url) => {
        calls += 1;
        assert.equal(url, 'https://www.cloudflarestatus.com/api/v2/summary.json');
        return Response.json({
          page: { status: 'UP' },
          activeIncidents: [],
          activeMaintenances: [],
        });
      },
      async () => {
        const [first, second] = await Promise.all([
          worker.fetch(request('/api/status/0'), env),
          worker.fetch(request('/api/status/0'), env),
        ]);
        assert.equal(first.headers.get('Cache-Control'), 'public, max-age=60, s-maxage=60');
        const firstBody = await first.json();
        const secondBody = await second.json();
        const third = await worker.fetch(request('/api/status/0'), env);
        const thirdBody = await third.json();
        assert.equal(calls, 1);
        assert.equal(matches, 0);
        assert.equal(puts, 0);
        assert.equal(secondBody.fetchedAt, firstBody.fetchedAt);
        assert.equal(thirdBody.fetchedAt, firstBody.fetchedAt);
        assert.equal(thirdBody.source, firstBody.source);
      }
    );
  } finally {
    resetEdgeMemory();
    if (originalCaches) Object.defineProperty(globalThis, 'caches', originalCaches);
    else delete globalThis.caches;
  }
});

test('status reads ignore Cache API hits and serve the live payload', async () => {
  const originalCaches = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  let matches = 0;
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: {
      default: {
        match: async () => {
          matches += 1;
          return Response.json({
            status: { indicator: 'major', description: 'cached outage' },
            fetchedAt: new Date().toISOString(),
            source: 'https://www.cloudflarestatus.com/api/v2/summary.json',
          });
        },
        put: async () => {},
      },
    },
  });
  let calls = 0;
  resetEdgeMemory();
  try {
    await withFetch(
      async () => {
        calls += 1;
        return Response.json({
          page: { status: 'UP' },
          activeIncidents: [],
          activeMaintenances: [],
        });
      },
      async () => {
        const response = await worker.fetch(request('/api/status/0'), env);
        assert.equal(response.status, 200);
        assert.equal(calls, 1);
        assert.equal(matches, 0);
        const body = await response.json();
        assert.equal(body.evidence.kind, 'official');
        assert.equal(body.status.indicator, 'none');
      }
    );
  } finally {
    resetEdgeMemory();
    if (originalCaches) Object.defineProperty(globalThis, 'caches', originalCaches);
    else delete globalThis.caches;
  }
});
test('status API does not cache successful responses with invalid status schema', async () => {
  const originalCaches = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  let puts = 0;
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: {
      default: {
        match: async () => undefined,
        put: async () => {
          puts += 1;
        },
      },
    },
  });
  let calls = 0;
  resetEdgeMemory();
  try {
    await withFetch(
      async () => {
        calls += 1;
        return Response.json({ unexpected: true });
      },
      async () => {
        const first = await worker.fetch(request('/api/status/1'), env);
        const second = await worker.fetch(request('/api/status/1'), env);
        assert.equal(first.headers.get('Cache-Control'), 'no-store');
        assert.equal(second.headers.get('Cache-Control'), 'no-store');
        assert.equal(calls, 2);
        assert.equal(puts, 0);
      }
    );
  } finally {
    resetEdgeMemory();
    if (originalCaches) Object.defineProperty(globalThis, 'caches', originalCaches);
    else delete globalThis.caches;
  }
});

test('status API keeps the last good result when a later read fails', async () => {
  const originalCaches = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: {
      default: {
        match: async () => undefined,
        put: async () => {},
      },
    },
  });
  resetEdgeMemory();
  let fail = false;
  try {
    await withFetch(
      async () => {
        if (fail) return new Response('down', { status: 503 });
        return Response.json({
          page: { status: 'UP' },
          activeIncidents: [],
          activeMaintenances: [],
        });
      },
      async () => {
        const first = await worker.fetch(request('/api/status/0'), env);
        assert.equal((await first.json()).status.indicator, 'none');
        const entry = globalThis.__egressScopeCache.status.values().next().value;
        entry.freshUntil = 0;
        fail = true;
        const second = await worker.fetch(request('/api/status/0'), env);
        assert.equal(second.status, 200);
        assert.equal((await second.json()).status.indicator, 'none');
        assert.equal(second.headers.get('Cache-Control'), 'public, max-age=60, s-maxage=60');
      }
    );
  } finally {
    resetEdgeMemory();
    if (originalCaches) Object.defineProperty(globalThis, 'caches', originalCaches);
    else delete globalThis.caches;
  }
});

test('status API returns an unknown result when the upstream fails', async () => {
  resetEdgeMemory();
  try {
    await withFetch(
      async () => new Response('blocked', { status: 403 }),
      async () => {
        const response = await worker.fetch(request('/api/status/0'), env);
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.status.indicator, 'unknown');
        assert.equal(body.status.description, '官方状态暂时不可达');
        assert.equal(body.temporary, undefined);
        assert.equal(response.headers.get('Cache-Control'), 'public, max-age=15, s-maxage=15');
      }
    );
  } finally {
    resetEdgeMemory();
  }
});
test('removed legacy risk endpoint returns 404', async () => {
  assert.equal((await worker.fetch(request('/api/iprisk/1.1.1.1'), env)).status, 404);
});
test('cross readings are served from /api/ip/cross without mixing scores', async () => {
  await withFetch(
    async (url, init) => {
      const href = String(url);
      if (href.includes('api.123169.xyz/api/info/ip-risk/')) {
        const headers = new Headers(init?.headers);
        if (headers.get('x-k')) return Response.json({ ok: true, data: { risk_score: 40 } });
        return new Response(JSON.stringify({ ok: false }), {
          headers: { 'x-k': 'test-key', 'x-t': '1000' },
        });
      }
      return new Response('no', { status: 403 });
    },
    async () => {
      const response = await worker.fetch(request('/api/ip/cross/1.1.1.1'), env);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.ip, '1.1.1.1');
      const purity = body.readings.find((item) => item.id === 'ippure-purity');
      assert.equal(purity?.value, '60');
      assert.ok(!body.unavailable.includes('ippure'));
    }
  );
});
test('removed DNS endpoints return 404 without querying upstream services', async () => {
  await withFetch(
    async () => {
      throw new Error('Unexpected upstream request');
    },
    async () => {
      const response = await worker.fetch(
        request('/api/dns/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        }),
        env
      );
      assert.equal(response.status, 404);
      assert.equal((await worker.fetch(request('/api/dns/result/old-session'), env)).status, 404);
    }
  );
});
test('Ping validates candidates and requests actual ICMP probes', async () => {
  let captured;
  await withFetch(
    async (url, init) => {
      assert.equal(url, 'https://api.globalping.io/v1/measurements');
      captured = JSON.parse(init.body);
      return Response.json({ id: 'measurement-id-123' });
    },
    async () => {
      const response = await worker.fetch(
        request('/api/ping/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ host: 'example.com', nodes: ['n03', 'n04'] }),
        }),
        env
      );
      assert.equal(response.status, 200);
      assert.equal(captured.type, 'ping');
      assert.equal(captured.limit, undefined);
      assert.equal(captured.locations.length, 2);
      assert.ok(captured.locations.every((location) => location.limit === 1));
      assert.equal(captured.measurementOptions.packets, 3);
      assert.equal(captured.locations[0].city, 'Tokyo');
      const invalid = await worker.fetch(
        request('/api/ping/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{"host":"example.com","nodes":["bad"]}',
        }),
        env
      );
      assert.equal(invalid.status, 400);
    }
  );
});
test('WHOIS uses RDAP and never turns a target into a free-form fetch URL', async () => {
  await withFetch(
    async (url) => {
      assert.equal(url, 'https://rdap.org/autnum/15169');
      return Response.json({ handle: 'AS15169' });
    },
    async () => {
      const response = await worker.fetch(request('/api/whois/lookup/AS15169'), env);
      const body = await response.json();
      assert.equal(body.data.handle, 'AS15169');
      assert.equal(body.source, 'RDAP · 注册记录');
    }
  );
});
test('upstream errors do not expose response bodies or credentials', async () => {
  await withFetch(
    async () => new Response('sensitive upstream body', { status: 429 }),
    async () => {
      await assert.rejects(
        () => upstream('https://provider.example/private-test-value'),
        (e) =>
          e.status === 429 &&
          !e.message.includes('sensitive') &&
          !e.message.includes('private-test-value')
      );
    }
  );
});
test('removed IP card endpoint returns 404', async () => {
  const response = await worker.fetch(request('/api/card.svg'), env);
  assert.equal(response.status, 404);
});

test('domain registration bypasses rdap.org using the IANA registry endpoint', async () => {
  const urls = [];
  await withFetch(
    async (url) => {
      urls.push(url);
      if (url === 'https://data.iana.org/rdap/dns.json')
        return Response.json({
          services: [[['com'], ['https://rdap.verisign.com/com/v1/']]],
        });
      assert.equal(url, 'https://rdap.verisign.com/com/v1/domain/qq.com');
      return Response.json({ ldhName: 'QQ.COM' });
    },
    async () => {
      const response = await worker.fetch(request('/api/whois/lookup/qq.com'), env);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).data.ldhName, 'QQ.COM');
    }
  );
  assert.equal(urls.length, 2);
});

test('unsupported domain suffix returns an explicit RDAP error', async () => {
  await withFetch(
    async (url) => {
      assert.equal(url, 'https://data.iana.org/rdap/dns.json');
      return Response.json({ services: [] });
    },
    async () => {
      const response = await worker.fetch(request('/api/whois/lookup/domain.zzz'), env);
      assert.equal(response.status, 422);
    }
  );
});

test('Ping catalog lists all online cities and aggregates probe counts', async () => {
  await withFetch(
    async (url) => {
      assert.equal(url, 'https://api.globalping.io/v1/probes');
      return Response.json([
        { location: { country: 'JP', city: 'Tokyo' } },
        { location: { country: 'JP', city: 'Tokyo' } },
        { location: { country: 'NZ', city: 'Auckland' } },
      ]);
    },
    async () => {
      const response = await worker.fetch(request('/api/ping/nodes'), env);
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.length, 2);
      assert.equal(data[0].id, 'JP:Tokyo');
      assert.equal(data[0].probes, 2);
      assert.equal(data[1].id, 'NZ:Auckland');
    }
  );
});
test('Ping accepts only catalog locations for dynamic selection', async () => {
  await withFetch(
    async (url, init) => {
      if (url.endsWith('/probes'))
        return Response.json([{ location: { country: 'NZ', city: 'Auckland' } }]);
      const payload = JSON.parse(init.body);
      assert.deepEqual(payload.locations, [{ country: 'NZ', city: 'Auckland', limit: 1 }]);
      return Response.json({ id: 'measurement-test' });
    },
    async () => {
      const makeRequest = (id) =>
        request('/api/ping/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ host: '1.1.1.1', nodes: [id] }),
        });
      assert.equal((await worker.fetch(makeRequest('NZ:Auckland'), env)).status, 200);
      assert.equal((await worker.fetch(makeRequest('NZ:Unknown'), env)).status, 400);
    }
  );
});

test('regional Ping requests spread probes across continents without conflicting limits', async () => {
  await withFetch(
    async (url, init) => {
      const body = JSON.parse(init.body);
      assert.deepEqual(body.locations, [
        { continent: 'AS', limit: 3 },
        { continent: 'EU', limit: 3 },
      ]);
      assert.equal(body.limit, undefined);
      assert.equal(body.inProgressUpdates, true);
      return Response.json({ id: 'regional-test' });
    },
    async () => {
      const response = await worker.fetch(
        request('/api/ping/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            host: '1.1.1.1',
            regions: ['AS', 'EU'],
            perRegion: 3,
          }),
        }),
        env
      );
      assert.equal(response.status, 200);
      const invalid = await worker.fetch(
        request('/api/ping/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            host: '1.1.1.1',
            regions: ['AS', 'EU'],
            perRegion: 30,
          }),
        }),
        env
      );
      assert.equal(invalid.status, 400);
    }
  );
});

test('preferred Ping pins the online major provider ASN while custom mode keeps city selection', async () => {
  await withFetch(
    async (url, init) => {
      if (url.endsWith('/probes'))
        return Response.json([
          {
            location: {
              country: 'US',
              city: 'Seattle',
              asn: 123,
              network: 'Small ISP',
            },
          },
          {
            location: {
              country: 'US',
              city: 'Seattle',
              asn: 16509,
              network: 'Amazon.com, Inc.',
            },
          },
        ]);
      const body = JSON.parse(init.body);
      assert.equal(body.locations[0].asn, 16509);
      assert.equal(body.locations[0].city, 'Seattle');
      return Response.json({ id: 'preferred-test' });
    },
    async () => {
      const response = await worker.fetch(
        request('/api/ping/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            host: '1.1.1.1',
            nodes: ['US:Seattle'],
            preferred: true,
          }),
        }),
        env
      );
      assert.equal(response.status, 200);
    }
  );
});

test('icon proxy races multiple providers, caches images and strips upstream cookies', async () => {
  const requested = [];
  await withFetch(
    async (url, options) => {
      requested.push(url);
      assert.equal(options.cf.cacheTtlByStatus['200-299'], 604800);
      if (url.includes('duckduckgo.com')) throw new Error('network blocked');
      if (url === 'https://github.com/favicon.ico')
        return new Response('<html>not found</html>', {
          headers: { 'Content-Type': 'text/html' },
        });
      return new Response(new Uint8Array([0, 0, 1, 0]), {
        headers: { 'Content-Type': 'image/x-icon', 'Set-Cookie': 'upstream=1' },
      });
    },
    async () => {
      const response = await worker.fetch(request('/api/icons/github.com'), env);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('Cache-Control'), 'public, max-age=86400');
      assert.equal(response.headers.get('Set-Cookie'), null);
      assert.equal((await response.arrayBuffer()).byteLength, 4);
      assert.deepEqual(requested.sort(), [
        'https://favicon.im/github.com?larger=true',
        'https://github.com/favicon.ico',
        'https://icons.duckduckgo.com/ip3/github.com.ico',
        'https://www.google.com/s2/favicons?domain=github.com&sz=64',
      ]);
    }
  );
});

test('icon proxy returns 502 only after every provider fails', async () => {
  await withFetch(
    async () => {
      throw new Error('network unreachable');
    },
    async () => {
      const response = await worker.fetch(request('/api/icons/github.com'), env);
      assert.equal(response.status, 502);
      assert.deepEqual(await response.json(), { error: '图标暂不可用' });
    }
  );
});

test('icon proxy rejects arbitrary URLs and non-image responses', async () => {
  await withFetch(
    async () => {
      throw new Error('must not fetch');
    },
    async () => {
      assert.equal(
        (await worker.fetch(request('/api/icons/https%3A%2F%2Fevil.com'), env)).status,
        400
      );
    }
  );
  await withFetch(
    async () =>
      new Response('<html>error</html>', {
        headers: { 'Content-Type': 'text/html' },
      }),
    async () => {
      const response = await worker.fetch(request('/api/icons/github.com'), env);
      assert.equal(response.status, 502);
      assert.equal(response.headers.get('Cache-Control'), 'public, max-age=300');
    }
  );
});

test('icon proxy rejects upstream redirects without forwarding Location', async () => {
  await withFetch(
    async () =>
      new Response(null, {
        status: 302,
        headers: { Location: 'https://example.com/icon.ico' },
      }),
    async () => {
      const response = await worker.fetch(request('/api/icons/github.com'), env);
      assert.equal(response.status, 502);
      assert.equal(response.headers.get('Location'), null);
      assert.deepEqual(await response.json(), { error: '图标暂不可用' });
    }
  );
});

test('WeChat icon uses its official resource because the icon provider returns 404', async () => {
  await withFetch(
    async (url) => {
      assert.equal(url, 'https://res.wx.qq.com/a/wx_fed/assets/res/NTI4MWU5.ico');
      return new Response('icon', {
        headers: { 'Content-Type': 'image/x-icon' },
      });
    },
    async () => {
      assert.equal((await worker.fetch(request('/api/icons/weixin.qq.com'), env)).status, 200);
    }
  );
});
