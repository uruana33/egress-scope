import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildReport } from '../src/views/ip/model/report.ts';

test('the report leads with the address and a quality verdict', () => {
  const text = buildReport({
    coffee: {
      ip: '1.1.1.1',
      country: '澳大利亚',
      isp: 'Cloudflare',
      asn: 13335,
      asOrganization: 'Cloudflare, Inc.',
      trust_score: 90,
      is_public_service: true,
    },
  });
  const lines = text.split('\n');
  assert.equal(lines[0], 'IP: 1.1.1.1');
  assert.ok(text.includes('澳大利亚 · Cloudflare'));
  assert.ok(text.includes('AS13335 Cloudflare, Inc.'));
  assert.ok(text.includes('质量结论: 公共服务地址'));
  assert.ok(text.includes('公共服务'));
  assert.ok(text.includes('IPQualityScore'));
  assert.ok(text.includes('AbuseIPDB'));
  assert.ok(!text.includes('undefined'));
  assert.ok(!text.includes('null'));
});

test('a bare address still produces a readable report with no empty lines', () => {
  const text = buildReport({ coffee: { ip: '203.0.113.7' } });
  const lines = text.split('\n');
  assert.equal(lines[0], 'IP: 203.0.113.7');
  assert.ok(lines.length >= 2);
  assert.ok(lines.every((line) => line.trim().length > 0));
});

test('an out-of-range Coffee score is not printed as if it were a purity number', () => {
  const text = buildReport({
    coffee: { ip: '203.0.113.7', trust_score: 140 },
  });
  assert.ok(!text.includes('140'));
});

test('the report exposes the point estimate, evidence-bounded range, and coverage semantics', () => {
  const text = buildReport({
    coffee: {
      ip: '1.1.1.1',
      country: '澳大利亚',
      isp: 'Cloudflare',
      asn: 13335,
      asOrganization: 'Cloudflare, Inc.',
      trust_score: 90,
      is_public_service: true,
    },
  });

  assert.match(text, /中心分 \d+/);
  assert.match(text, /质量区间 \d+–\d+/);
  assert.match(text, /证据覆盖 \d+%/);
  assert.match(text, /覆盖等级：低|覆盖等级: Low|覆盖等级: Medium|覆盖等级: High/);
  assert.match(text, /原始权重/);
  assert.match(text, /有效权重/);
  assert.match(text, /不是统计置信区间/);
  assert.match(text, /不是统计置信度/);
});

test('the report carries the same pending state as the page while cross sources are loading', () => {
  const readyText = buildReport({
    coffee: { ip: '203.0.113.7', trust_score: 80 },
  });
  const pendingText = buildReport({ coffee: { ip: '203.0.113.7', trust_score: 80 } }, null, {
    pending: true,
  });

  assert.ok(!readyText.includes('读取状态：更新中'));
  assert.ok(pendingText.includes('读取状态：更新中'));
});
