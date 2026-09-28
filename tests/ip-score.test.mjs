import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ipScoreColor, ipScoreEstimateColor } from '../src/lib/ip-score.ts';

test('IP score colors use the same boundaries and never treat missing scores as zero', () => {
  for (const score of [0, 39]) assert.equal(ipScoreColor(score), 'var(--danger)');
  for (const score of [40, 59]) assert.equal(ipScoreColor(score), 'var(--caution)');
  for (const score of [60, 79]) assert.equal(ipScoreColor(score), 'var(--warning)');
  for (const score of [80, 100]) assert.equal(ipScoreColor(score), 'var(--success)');
  for (const score of [undefined, null, NaN, Infinity, -1, 101])
    assert.equal(ipScoreColor(score), 'var(--muted-foreground)');
});

test('estimate colors keep the band hue but desaturate toward neutral', () => {
  for (const score of [0, 39]) assert.match(ipScoreEstimateColor(score), /var\(--danger\)/);
  for (const score of [40, 59]) assert.match(ipScoreEstimateColor(score), /var\(--caution\)/);
  for (const score of [60, 79]) assert.match(ipScoreEstimateColor(score), /var\(--warning\)/);
  for (const score of [80, 100]) assert.match(ipScoreEstimateColor(score), /var\(--success\)/);
  assert.match(ipScoreEstimateColor(80), /muted-foreground/);
  assert.equal(ipScoreEstimateColor(null), 'var(--muted-foreground)');
});
