import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { assessQuality } from '../src/views/ip/model/quality.ts';

const corpus = JSON.parse(
  readFileSync(new URL('../scripts/ip-quality-data/samples.json', import.meta.url))
);
const target = corpus.samples.find((sample) => sample.ip === '124.126.3.108');
const run = (sample) =>
  assessQuality(sample.coffee, sample.cross, {
    now: Date.parse(sample.collectedAt),
  });

test('the requested address keeps a readable score when IPPure is unavailable', () => {
  const result = run(target);
  assert.equal(result.score, 92);
  assert.equal(result.scoreStatus, 'provisional');
  assert.equal(result.scoreReference, true);
  assert.ok(result.scoreMissingSources.includes('ippure'));
  assert.equal(result.kind, 'disputed');
  assert.equal(result.headline, '风险较低，用途待核实');
  assert.match(result.shortSummary, /住宅.*机构/);
  assert.ok(result.shortSummary.length <= 60);
  assert.doesNotMatch(result.shortSummary, /Net.Coffee|IPinfo|IPQS|AbuseIPDB|government|2026/);
  assert.ok(result.tags.length <= 3);
  assert.equal(result.keyEvidence.title, '用途来源对照');
  assert.deepEqual(
    result.keyEvidence.rows.map((row) => [row.source, row.value]),
    [
      ['Net.Coffee', '住宅网络'],
      ['IP2Location', '教育机构'],
      ['proxycheck.io', '商业网络'],
    ]
  );
});

test('unknown dimensions stay null while known reputation still yields an estimate', () => {
  const result = assessQuality({ ip: '203.0.113.80', trust_score: 80 });
  assert.equal(result.score, 66);
  assert.equal(result.scoreBreakdown.anonymity, null);
  assert.equal(result.scoreBreakdown.usage, null);
  assert.equal(result.scoreStatus, 'provisional');
  assert.doesNotMatch(result.shortSummary, /未检出代理|未检出匿名/);
});

test('Tor risk remains visible and capped even if reputation is unavailable', () => {
  const result = assessQuality({ ip: '203.0.113.80', is_tor: true });
  assert.ok(result.score != null && result.score <= 25);
  assert.equal(result.scoreBreakdown.reputation, null);
  assert.equal(result.scoreStatus, 'provisional');
  assert.match(result.shortSummary, /Tor/);
});

test('high-risk key evidence shows the abuse flag, not a contradictory trust score', () => {
  const result = assessQuality({
    ip: '203.0.113.80',
    trust_score: 97,
    is_abuser: true,
    is_proxy: true,
  });
  assert.equal(result.kind, 'high-risk');
  assert.equal(result.keyEvidence.title, '主要风险信号');
  assert.match(result.keyEvidence.rows[0].value, /滥用/);
  assert.doesNotMatch(result.keyEvidence.rows[0].value, /97/);
});

test('an address or usage label alone does not fabricate a quality score', () => {
  for (const coffee of [{ ip: '203.0.113.80' }, { ip: '203.0.113.80', isResidential: true }]) {
    const result = assessQuality(coffee);
    assert.equal(result.score, null);
    assert.equal(result.scoreStatus, 'unavailable');
    assert.equal(result.scoreBreakdown.reputation, null);
    assert.equal(result.scoreBreakdown.anonymity, null);
  }
});

test('removing a provider yields an estimate with that gap disclosed', () => {
  const sample = corpus.samples.find((sample) => sample.ip === '74.120.253.118');
  const full = run(sample);
  assert.equal(full.scoreStatus, 'ready');
  const reduced = run({
    ...sample,
    cross: {
      ...sample.cross,
      readings: sample.cross.readings.filter((row) => row.source !== 'ip2location'),
    },
  });
  assert.equal(reduced.score, 87);
  assert.equal(reduced.scoreStatus, 'provisional');
  assert.ok(reduced.scoreMissingSources.includes('ip2location'));
  assert.equal(reduced.kind, 'disputed');
});
