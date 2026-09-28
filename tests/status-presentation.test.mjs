import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  STATUS_FRESHNESS_MS,
  isStatusExpired,
  presentStatus,
  presentSummary,
  statusLabelKey,
} from '../src/views/status/presentation.ts';

const now = Date.parse('2026-09-20T00:00:00Z');
const payload = (overrides = {}) => ({
  status: { indicator: 'none', description: 'All Systems Operational' },
  fetchedAt: new Date(now).toISOString(),
  source: 'https://status.example.test/api',
  ...overrides,
});

test('official indicator takes priority over an English description', () => {
  assert.equal(statusLabelKey('All Systems Operational', 'none'), '正常运行');
  assert.equal(statusLabelKey('operational'), '正常运行');
  assert.equal(statusLabelKey('partial_outage'), '部分故障');
});

test('expired status data is no longer current', () => {
  assert.equal(isStatusExpired(new Date(now - STATUS_FRESHNESS_MS - 1).toISOString(), now), true);
  const result = presentStatus(
    {
      url: 'https://status.example.test/api',
      data: payload({
        fetchedAt: new Date(now - STATUS_FRESHNESS_MS - 1).toISOString(),
      }),
    },
    now
  );
  assert.equal(result.indicator, 'unknown');
  assert.equal(result.current, false);
  assert.equal(result.stale, true);
  assert.equal(result.textKey, '上次结果：{0}');
});

test('refetch errors retain the previous result as stale evidence', () => {
  const result = presentStatus(
    {
      url: 'https://status.example.test/api',
      isRefetchError: true,
      data: payload(),
    },
    now
  );
  assert.equal(result.indicator, 'unknown');
  assert.equal(result.current, false);
  assert.deepEqual(result.textValues, ['正常运行']);
});

test('reachability HTTP 500 remains visible without becoming a platform outage', () => {
  const result = presentStatus(
    {
      url: 'https://status.example.test/api',
      data: payload({
        status: { indicator: 'unknown', description: 'HTTP 503 响应' },
        evidence: {
          kind: 'reachability',
          label: '端点可达性探测',
          endpoints: [
            {
              label: 'API',
              url: 'https://api.example.test',
              transport: 'response',
              httpStatus: 503,
            },
          ],
        },
      }),
    },
    now
  );
  assert.equal(result.indicator, 'unknown');
  assert.equal(result.textKey, 'HTTP {0} 异常 · 业务状态未知');
  assert.deepEqual(result.textValues, ['503']);
});

test('summary never reports all healthy while one service is unknown', () => {
  const summary = presentSummary(
    [
      {
        url: 'https://one.example.test',
        data: payload(),
      },
      {
        url: 'https://two.example.test',
        data: payload({
          status: { indicator: 'unknown', description: '待确认' },
        }),
      },
    ],
    now
  );
  assert.equal(summary.healthyCount, 1);
  assert.equal(summary.unknownCount, 1);
  assert.equal(summary.headlineKey, '{0} 个服务待确认');
});
