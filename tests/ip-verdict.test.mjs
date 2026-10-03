import assert from 'node:assert/strict';
import { test } from 'node:test';

import { summarize, usableScore } from '../src/views/ip/model/verdict.ts';

const verdict = (data, id) => summarize(data).find((item) => item.id === id);

test('a datacenter address is called out as such rather than left to the reader', () => {
  const result = verdict({ ip: '1.1.1.1', is_datacenter: true }, 'usage');
  assert.equal(result.tone, 'warn');
});

test('a public service outranks its datacenter flag, because that is what it is', () => {
  const result = verdict({ ip: '1.1.1.1', is_public_service: true, is_datacenter: true }, 'usage');
  assert.equal(result.tone, 'neutral');
  assert.equal(result.value, '公共服务');
});

test('absent proxy checks read as unknown, never as a clean result', () => {
  assert.equal(verdict({ ip: '1.1.1.1' }, 'risk').value, '未知');
  assert.equal(verdict({ ip: '1.1.1.1', is_vpn: false }, 'risk').value, '未检测到');
});

test('an abuse record is graded above a plain VPN exit', () => {
  assert.equal(verdict({ ip: '1.1.1.1', is_vpn: true }, 'risk').tone, 'warn');
  assert.equal(verdict({ ip: '1.1.1.1', is_abuser: true }, 'risk').tone, 'bad');
});

test('the origin verdict names both countries so the mismatch is actionable', () => {
  const result = verdict(
    {
      ip: '1.1.1.1',
      countryCode: 'JP',
      country: '日本',
      registered_country_code: 'us',
      registered_country: '美国',
    },
    'origin'
  );
  assert.equal(result.value, '注册地不同');
  assert.match(result.hint, /美国/);
  assert.match(result.hint, /日本/);
});

test('case differences between the two country codes are not a mismatch', () => {
  const result = verdict(
    { ip: '1.1.1.1', countryCode: 'JP', registered_country_code: 'jp' },
    'origin'
  );
  assert.equal(result.tone, 'good');
});

test('a public service still outranks conflicting usage flags', () => {
  const result = verdict(
    {
      ip: '1.1.1.1',
      is_public_service: true,
      is_datacenter: true,
      asn_kind: 'residential',
    },
    'usage'
  );
  assert.equal(result.value, '公共服务');
  assert.equal(result.tone, 'neutral');
});

test('Coffee calling the same address residential ASN and datacenter is a disagreement, not a datacenter', () => {
  const result = verdict(
    { ip: '208.67.222.222', is_datacenter: true, asn_kind: 'residential' },
    'usage'
  );
  assert.equal(result.value, '存在分歧');
  assert.equal(result.tone, 'warn');
  assert.match(result.hint, /数据中心/);
  assert.match(result.hint, /住宅 ASN/);
});

test('home-line and datacenter flags together are also a disagreement', () => {
  const result = verdict({ ip: '203.0.113.7', isResidential: true, is_datacenter: true }, 'usage');
  assert.equal(result.value, '存在分歧');
  assert.match(result.hint, /家庭宽带/);
  assert.match(result.hint, /数据中心/);
});

test('a score that cannot be drawn is reported as unknown instead of zero', () => {
  assert.equal(usableScore(0), 0);
  assert.equal(usableScore(101), null);
  assert.equal(usableScore(Number.NaN), null);
  assert.equal(usableScore('80'), null);
  assert.equal(usableScore(undefined), null);
});
