import { QueryClient, QueryObserver } from '@tanstack/react-query';
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  currentHttpExits,
  httpReferenceGeoQuery,
  httpReferenceQueries,
} from '../src/views/egress/http-reference.ts';

test('DNS and CDN retests request fresh HTTP addresses and their matching geo', async (t) => {
  let ip = '8.8.8.8';
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push(url);
    if (init.method === 'HEAD') return new Response(null, { headers: { 'cdn-user-ip': ip } });
    return Response.json({
      ip,
      country: ip === '8.8.8.8' ? 'First' : 'Second',
    });
  });
  for (const scope of ['dns', 'cdn']) {
    const client = new QueryClient();
    try {
      ip = '8.8.8.8';
      const first = await Promise.all(
        httpReferenceQueries(scope, 0).map((q) => client.fetchQuery(q))
      );
      assert.ok(first.every((value) => value.ip === ip));
      const oldGeo = await client.fetchQuery(httpReferenceGeoQuery(scope, 0, ip));
      ip = '1.1.1.1';
      const before = calls.length;
      const next = await Promise.all(
        httpReferenceQueries(scope, 1).map((q) => client.fetchQuery(q))
      );
      assert.equal(calls.length - before, 2);
      const geo = await client.fetchQuery(httpReferenceGeoQuery(scope, 1, ip));
      assert.equal(geo.country, 'Second');
      const settled = (data) => ({ data, isFetching: false, isError: false });
      assert.deepEqual(currentHttpExits(next.map(settled), [settled(oldGeo), settled(geo)]), [
        { ...geo, path: 'overseas' },
      ]);
    } finally {
      client.clear();
    }
  }
});

test('a failed or refreshing HTTP reference never exposes retained old data', async () => {
  const client = new QueryClient();
  const options = httpReferenceQueries('dns', 0)[0];
  client.setQueryData(options.queryKey, { ip: '8.8.8.8' });
  const observer = new QueryObserver(client, {
    ...options,
    queryFn: async () => {
      throw Error('Probe failed');
    },
  });
  try {
    const failed = await observer.refetch();
    assert.equal(failed.data.ip, '8.8.8.8');
    const empty = { isFetching: false, isError: false };
    assert.deepEqual(currentHttpExits([failed, empty], []), []);
    assert.deepEqual(
      currentHttpExits([{ ...failed, isError: false, isFetching: true }, empty], []),
      []
    );
  } finally {
    client.clear();
  }
});

test('geo enrichment cannot substitute another address or combine with an old run', () => {
  const settled = (data) => ({ data, isFetching: false, isError: false });
  const references = [settled({ ip: '1.1.1.1' }), settled({ ip: '8.8.8.8' })];
  const results = currentHttpExits(references, [
    settled({ ip: '8.8.8.8', country: 'Wrong' }),
    { ...settled({ ip: '8.8.8.8', country: 'Old' }), isFetching: true },
  ]);
  assert.deepEqual(results, [
    { ip: '1.1.1.1', path: 'domestic' },
    { ip: '8.8.8.8', path: 'overseas' },
  ]);
});
