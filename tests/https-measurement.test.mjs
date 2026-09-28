import assert from 'node:assert/strict';
import { test } from 'node:test';

import worker from '../.worker-test/index.js';

async function startPing(input) {
  const response = await worker.fetch(
    new Request('https://tools.example.com/api/ping/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
    { APP_ENV: 'prod' }
  );
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
}

test('HTTPS measurements are fixed-port HEAD requests and do not alter ICMP defaults', async () => {
  const previous = globalThis.fetch;
  const requests = [];
  try {
    globalThis.fetch = async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return Response.json({ id: 'measurement-123' });
    };
    await startPing({
      host: '1.1.1.1',
      protocol: 'https',
      regions: ['AS', 'EU', 'NA'],
      perRegion: 1,
    });
    assert.equal(requests[0].type, 'http');
    assert.deepEqual(requests[0].measurementOptions, {
      protocol: 'HTTPS',
      port: 443,
      request: { method: 'HEAD', path: '/' },
    });
    await startPing({ host: '1.1.1.1', regions: ['AS'], perRegion: 1 });
    assert.equal(requests[1].type, 'ping');
    assert.equal(requests[1].measurementOptions.packets, 3);
    await assert.rejects(() =>
      startPing({
        host: '127.0.0.1',
        protocol: 'https',
        regions: ['AS'],
        perRegion: 1,
      })
    );
    await assert.rejects(() =>
      startPing({
        host: '1.1.1.1',
        protocol: 'ssh',
        regions: ['AS'],
        perRegion: 1,
      })
    );
    assert.equal(requests.length, 2);
  } finally {
    globalThis.fetch = previous;
  }
});
