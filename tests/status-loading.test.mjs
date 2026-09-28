import assert from 'node:assert/strict';
import { test } from 'node:test';

import { statusBatchSize, statusLoadBatch, statusLoadIds } from '../src/views/status/loading.ts';
import services from '../src/views/status/services.json' with { type: 'json' };

test('status page initially enables a small batch on the all filter', () => {
  const ids = statusLoadIds(services, '全部', null, 0);
  assert.equal(ids.size, statusBatchSize);
  assert.deepEqual(
    [...ids],
    services
      .filter((service) => service.url)
      .slice(0, statusBatchSize)
      .map((service) => service.id)
  );
});

test('status page batches a group and keeps the focused service visible', () => {
  const ids = statusLoadIds(services, 'AI', '0', 0);
  assert.equal(ids.has('0'), true);
  assert.equal([...ids].filter((id) => id !== '0').length, statusBatchSize);
  assert.deepEqual(
    [...ids].filter((id) => id !== '0').sort(),
    services
      .filter((service) => service.url && service.group === 'AI')
      .slice(0, statusBatchSize)
      .map((service) => service.id)
      .sort()
  );
});

test('status page advances batches within the selected group', () => {
  const ai = services.filter((service) => service.url && service.group === 'AI');
  const complete = new Set(ai.slice(0, statusBatchSize).map((s) => s.id));
  assert.equal(
    statusLoadBatch(services, (service) => complete.has(service.id), 'AI'),
    1
  );
  const finalBatch = Math.ceil(ai.length / statusBatchSize) - 1;
  const ids = statusLoadIds(services, 'AI', null, finalBatch);
  assert.equal(ids.size, ai.length);
});

test('status page batches eventually cover every integrated service', () => {
  const integrated = services.filter((service) => service.url);
  const finalBatch = Math.ceil(integrated.length / statusBatchSize) - 1;
  const ids = statusLoadIds(services, '全部', null, finalBatch);
  assert.equal(ids.size, integrated.length);
});

test('status page advances only past completed batches', () => {
  const integrated = services.filter((service) => service.url);
  const complete = new Set(integrated.slice(0, statusBatchSize).map((s) => s.id));

  assert.equal(
    statusLoadBatch(services, (service) => complete.has(service.id)),
    1
  );
  complete.add(integrated[statusBatchSize].id);
  assert.equal(
    statusLoadBatch(services, (service) => complete.has(service.id)),
    1
  );
});
