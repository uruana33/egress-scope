import assert from 'node:assert/strict';
import { test } from 'node:test';

import { summarizeCampResults } from '../src/views/ai/fleet-stats.ts';

test('fleet summary separates responses, unconfirmed probes, and restricted probes', () => {
  const result = summarizeCampResults([
    { median: 80, status: 'response' },
    { median: null, status: 'unknown' },
    { median: null, status: 'restricted' },
    { median: 120, status: 'response' },
  ]);
  assert.deepEqual(result, {
    responded: 2,
    unconfirmed: 1,
    restricted: 1,
    total: 4,
    avg: 100,
  });
});
