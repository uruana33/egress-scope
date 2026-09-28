import assert from 'node:assert/strict';
import { test } from 'node:test';

import { selectRefreshableAiQueries } from '../src/views/ai/query-refresh.ts';

test('selectRefreshableAiQueries only returns enabled query slots', () => {
  const queries = [{ id: 'gpt' }, { id: 'gemini' }, { id: 'claude' }];

  assert.deepEqual(selectRefreshableAiQueries(queries, [true, false, true]), [
    queries[0],
    queries[2],
  ]);
});

test('selectRefreshableAiQueries ignores missing enablement entries', () => {
  const queries = [{ id: 'gpt' }, { id: 'gemini' }];

  assert.deepEqual(selectRefreshableAiQueries(queries, [true]), [queries[0]]);
});
