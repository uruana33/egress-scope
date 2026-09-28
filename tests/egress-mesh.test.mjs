import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildMeshLinks,
  leafBusY,
  treeBusY,
  treeFork,
  treeStem,
} from '../src/views/egress/mesh.ts';

test('a forked trunk drops to a shared bus then onto the card', () => {
  const path = treeFork({ x: 100, y: 10 }, { x: 40, y: 80 }, 40);
  assert.equal(path, 'M 100.0 10.0 L 100.0 40.0 L 40.0 40.0 L 40.0 80.0');
});

test('a single-lane trunk is a straight vertical stem', () => {
  const path = treeFork({ x: 100, y: 10 }, { x: 100, y: 80 }, 40);
  assert.equal(path, 'M 100.0 10.0 L 100.0 80.0');
});

test('the bus sits between the hub and the nearest card', () => {
  const busY = treeBusY({ x: 100, y: 10 }, [
    { x: 40, y: 80 },
    { x: 160, y: 90 },
  ]);
  assert.equal(busY, 10 + Math.max(20, Math.min(40, (80 - 10) * 0.5)));
});

test('a stem stays vertical when the cluster lines up', () => {
  assert.equal(treeStem({ x: 40, y: 120 }, { x: 40, y: 160 }), 'M 40.0 120.0 L 40.0 160.0');
});

test('each lane is hub-to-ip then ip-to-sites', () => {
  const links = buildMeshLinks({
    origin: { x: 100, y: 10 },
    lanes: [
      {
        key: '1.1.1.1',
        kind: 'exit',
        tone: 'green',
        packets: 1,
        laneIndex: 0,
        entry: { x: 40, y: 80 },
        dock: { x: 40, y: 120 },
        leaves: [{ x: 40, y: 150 }],
      },
      {
        key: '8.8.8.8',
        kind: 'exit',
        tone: 'blue',
        packets: 1,
        laneIndex: 1,
        entry: { x: 160, y: 80 },
        dock: { x: 160, y: 120 },
        leaves: [{ x: 160, y: 150 }],
      },
    ],
  });
  assert.deepEqual(
    links.map((link) => link.role),
    ['trunk', 'tail', 'trunk', 'tail']
  );
  assert.equal(links.length, 4);
  assert.ok(links.every((link) => link.d.startsWith('M ')));
  assert.ok(links.every((link) => link.d.includes(' L ')));
  const trunks = links.filter((link) => link.role === 'trunk');
  assert.equal(new Set(trunks.map((link) => link.d.match(/L [\d.]+ ([\d.]+)/)?.[1])).size, 1);
});

test('idle lanes still get the hub-ip-site chain', () => {
  const links = buildMeshLinks({
    origin: { x: 80, y: 8 },
    lanes: [
      {
        key: 'idle',
        kind: 'idle',
        tone: 'gray',
        packets: 0,
        laneIndex: 0,
        entry: { x: 80, y: 64 },
        dock: { x: 80, y: 110 },
        leaves: [{ x: 80, y: 140 }],
      },
    ],
  });
  assert.deepEqual(
    links.map((link) => link.role),
    ['trunk', 'tail']
  );
  assert.equal(links[0].d, 'M 80.0 8.0 L 80.0 64.0');
});

test('multiple site groups fan off one IP on a shared leaf bus', () => {
  const dock = { x: 100, y: 80 };
  const leaves = [
    { x: 40, y: 120 },
    { x: 160, y: 120 },
  ];
  const links = buildMeshLinks({
    origin: { x: 100, y: 10 },
    lanes: [
      {
        key: '1.1.1.1',
        kind: 'exit',
        tone: 'green',
        packets: 1,
        laneIndex: 0,
        entry: { x: 100, y: 50 },
        dock,
        leaves,
      },
    ],
  });
  const tails = links.filter((link) => link.role === 'tail');
  assert.equal(tails.length, 2);
  const bus = leafBusY(dock, leaves);
  assert.ok(tails.every((link) => link.d.includes(` ${bus.toFixed(1)}`)));
  assert.equal(tails.filter((link) => link.packets > 0).length, 2);
});
