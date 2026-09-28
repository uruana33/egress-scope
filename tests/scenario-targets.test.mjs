import assert from 'node:assert/strict';
import { test } from 'node:test';

import { accessTargets, scenarioGroups } from '../src/views/ip/scenario-targets.ts';

test('every scenario has diverse, distinct public targets instead of manual-only placeholders', () => {
  assert.ok(scenarioGroups.length >= 12);
  for (const group of scenarioGroups) {
    assert.ok(group.targets.length >= 5, group.id);
    assert.equal(new Set(group.targets.map((target) => target.url)).size, group.targets.length);
    assert.ok(
      new Set(group.targets.map((target) => new URL(target.website ?? target.url).hostname)).size >=
        5
    );
    for (const target of group.targets) {
      const url = new URL(target.url);
      assert.equal(url.protocol, 'https:');
      assert.equal(url.username, '');
      assert.equal(url.password, '');
      assert.ok(target.name);
    }
  }
});
test('initial work is interleaved so later scenarios do not wait for earlier groups', () => {
  assert.deepEqual(
    accessTargets.slice(0, scenarioGroups.length),
    scenarioGroups.map((group) => group.targets[0])
  );
  assert.equal(
    accessTargets.length,
    scenarioGroups.reduce((sum, group) => sum + group.targets.length, 0)
  );
});
