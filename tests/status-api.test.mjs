import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

import { createConcurrencyLimiter } from '../src/lib/network.ts';

const { outputText } = ts.transpileModule(readFileSync('src/views/status/api.ts', 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
  },
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('status API caps concurrent status requests', async () => {
  let active = 0;
  let peak = 0;
  const endpoint = async () => {
    active += 1;
    peak = Math.max(peak, active);
    await wait(5);
    active -= 1;
    return { status: { indicator: 'none', description: 'ok' } };
  };
  const require = (name) => {
    if (name === '@/lib/network') return { createConcurrencyLimiter, endpoint };
    throw new Error(`Unexpected import: ${name}`);
  };
  const exports = {};
  new Function('require', 'exports', outputText)(require, exports);

  const result = await Promise.all(
    Array.from({ length: 20 }, (_, index) => exports.getStatus(String(index)))
  );
  assert.equal(exports.statusConcurrencyLimit, 6);
  assert.equal(peak, exports.statusConcurrencyLimit);
  assert.equal(result.length, 20);
});
