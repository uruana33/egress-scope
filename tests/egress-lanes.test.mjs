import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  groupEgressLanes,
  groupLaneSites,
  summarizeEgressLanes,
} from '../src/views/egress/lanes.ts';

const site = (id, extra = {}) => ({
  id,
  name: id,
  icon: `${id}.png`,
  visible: true,
  pending: false,
  ...extra,
});

test('sites that left from the same public IP collapse onto one lane', () => {
  const lanes = groupEgressLanes([
    site('a', { geo: { ip: '1.1.1.1', country: 'US' } }),
    site('b', { geo: { ip: '1.1.1.1' } }),
    site('c', { geo: { ip: '8.8.8.8' } }),
  ]);
  const exits = lanes.filter((lane) => lane.kind === 'exit');
  assert.equal(exits.length, 2);
  assert.equal(exits.find((lane) => lane.ip === '1.1.1.1')?.sites.length, 2);
  assert.equal(summarizeEgressLanes(lanes).readCount, 3);
});

test('blocked, pending and idle stay off the exit story', () => {
  const lanes = groupEgressLanes([
    site('ok', { geo: { ip: '1.1.1.1' } }),
    site('wait', { pending: true }),
    site('nope'),
    site('later', { visible: false }),
  ]);
  const summary = summarizeEgressLanes(lanes);
  assert.equal(summary.exitCount, 1);
  assert.equal(summary.pendingCount, 1);
  assert.equal(summary.blockedCount, 1);
  assert.equal(summary.idleCount, 1);
  assert.deepEqual(
    lanes.map((lane) => lane.kind),
    ['blocked', 'pending', 'exit', 'idle']
  );
});

test('sites on one exit split into catalog groups', () => {
  const lanes = groupEgressLanes([
    site('ipcn', {
      type: 'domestic',
      geo: { ip: '1.1.1.1' },
    }),
    site('claude', {
      type: 'international',
      extra: ['ai'],
      geo: { ip: '1.1.1.1' },
    }),
    site('gpt', {
      type: 'international',
      extra: ['ai'],
      geo: { ip: '1.1.1.1' },
    }),
    site('x', {
      type: 'international',
      extra: ['social'],
      geo: { ip: '1.1.1.1' },
    }),
    site('okta', {
      type: 'international',
      extra: ['risk'],
      geo: { ip: '1.1.1.1' },
    }),
  ]);
  const groups = groupLaneSites(lanes[0].sites).map((group) => group.key);
  assert.deepEqual(groups, ['domestic', 'ai', 'social', 'risk']);
  assert.equal(groupLaneSites(lanes[0].sites).find((group) => group.key === 'ai')?.sites.length, 2);
});

test('busier exits sort ahead of quieter ones once they share a kind', () => {
  const lanes = groupEgressLanes([
    site('one', { geo: { ip: '8.8.8.8' } }),
    site('two-a', { geo: { ip: '1.1.1.1' } }),
    site('two-b', { geo: { ip: '1.1.1.1' } }),
  ]);
  assert.deepEqual(
    lanes.map((lane) => lane.ip),
    ['1.1.1.1', '8.8.8.8']
  );
});
