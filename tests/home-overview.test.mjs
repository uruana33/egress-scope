import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assessHomeExits, selectHomeCards } from '../src/views/home/overview.ts';

const fail = { isPending: false, isError: true };
const domestic = { data: { ip: '223.5.5.5' } };
const external = { data: { ip: '8.26.56.26' } };
test('one failed probe cannot move the other into its role or claim agreement', () => {
  const cards = selectHomeCards([fail, external]);
  assert.deepEqual(
    cards.map((card) => card.role),
    ['external']
  );
  assert.equal(cards[0].data.ip, external.data.ip);
  assert.equal(assessHomeExits([fail, external]), 'partial');
  assert.equal(assessHomeExits([domestic, fail]), 'partial');
});
test('matching and differing results describe observations, not routing mechanisms', () => {
  assert.equal(assessHomeExits([domestic, external]), 'different');
  assert.equal(assessHomeExits([domestic, domestic]), 'same');
  assert.equal(selectHomeCards([domestic, domestic]).length, 1);
  assert.equal(selectHomeCards([domestic, domestic])[0].role, 'shared');
});
test('loading and stale failures cannot make two-current-result verdicts', () => {
  assert.equal(assessHomeExits([{ isPending: true }, external]), 'pending');
  assert.equal(assessHomeExits([{ ...domestic, isError: true }, external]), 'partial');
  const oneOld = [{ ...domestic, isError: true }, domestic];
  assert.deepEqual(
    selectHomeCards(oneOld).map((card) => card.role),
    ['domestic', 'external']
  );
  assert.equal(assessHomeExits(oneOld), 'partial');
  assert.equal(assessHomeExits([fail, fail]), 'empty');
  assert.equal(assessHomeExits([{ data: { ip: '2606:4700:4700::1111' } }, external]), 'partial');
});
