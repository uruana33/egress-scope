import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isTheme, migrateTheme } from '../src/store/theme.ts';

test('named palettes replace the old light/dark/system values', () => {
  assert.equal(migrateTheme('light', false), 'paper');
  assert.equal(migrateTheme('dark', true), 'ink');
  assert.equal(migrateTheme('system', true), 'ink');
  assert.equal(migrateTheme('system', false), 'paper');
  assert.equal(migrateTheme('parchment', true), 'parchment');
  assert.equal(migrateTheme('chart', false), 'chart');
  assert.equal(migrateTheme('ember', false), 'ember');
  assert.equal(migrateTheme('unknown', true), 'ink');
  assert.equal(isTheme('paper'), true);
  assert.equal(isTheme('system'), false);
});
