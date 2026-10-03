import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { parseIpinfo, parseProxyCheck } from '../public/worker/ip-cross.js';
import { assessQuality } from '../src/views/ip/model/quality.ts';

const ip = '223.5.5.5';
const coffee = {
  ip,
  trust_score: 97,
  isResidential: true,
  is_datacenter: false,
  is_vpn: false,
  is_proxy: false,
  is_tor: false,
  company_type: 'government',
};
const negative = { vpn: false, proxy: false, tor: false };
const reading = (source, metric, value, flags) => ({
  id: `${source}-${metric}`,
  source,
  metric,
  value,
  flags,
  hint: '',
  tone: 'neutral',
  href: `https://example.test/${source}`,
});
const intel = (readings) => ({ ip, readings, unavailable: [] });

test('residential versus EDU/Business is a visible usage dispute', () => {
  const result = assessQuality(
    coffee,
    intel([
      reading('ip2location', 'usage', '(EDU) University/College/School'),
      reading('proxycheck', 'usage', 'Business'),
      reading('ipinfo', 'privacy', 'No', negative),
    ])
  );
  assert.equal(result.kind, 'disputed');
  assert.match(result.network.value, /用途.*分歧/);
  assert.match(result.summary, /IP2Location/);
  assert.match(result.summary, /proxycheck/);
  assert.doesNotMatch(result.summary, /交叉验证偏向住宅/);
});

test('fraud and usage sources cannot stand in for missing anonymity evidence', () => {
  const result = assessQuality(
    { ip },
    intel([
      reading('scamalytics', 'fraud', '0'),
      reading('ip2location', 'fraud', '0'),
      reading('ip2location', 'usage', 'EDU'),
    ])
  );
  assert.equal(result.scoreBreakdown.anonymity, null);
  assert.ok(result.score != null);
  assert.equal(result.scoreStatus, 'provisional');
  assert.equal(result.scoreReference, true);
  assert.equal(result.evidence.anonymity.length, 0);
  assert.notEqual(result.sources.find((s) => s.id === 'coffee').status, 'ready');
});

test('partial negatives and legacy flattened No do not invent other negative fields', () => {
  for (const flags of [undefined, { vpn: false }]) {
    const result = assessQuality(
      { ip },
      intel([{ ...reading('ipinfo', 'privacy', 'No', flags), tone: 'good' }])
    );
    const source = result.sources.find((s) => s.id === 'ipinfo');
    assert.equal(source.proxy, null);
    assert.equal(source.tor, null);
    assert.equal(source.hosting, null);
    assert.notEqual(source.tone, 'good');
    assert.equal(result.scoreBreakdown.anonymity, null);
    assert.ok(!source.rows.some((r) => r.label === '代理' && r.value === '否'));
    assert.doesNotMatch(result.summary, /未标 VPN|未见匿名出口/);
  }
});

test('parser partial responses cannot produce a clean end-to-end verdict', () => {
  const readings = [
    ...parseIpinfo(
      JSON.stringify({
        '@type': 'PropertyValue',
        name: 'IP Address',
        value: ip,
      }),
      ip
    ),
    ...parseProxyCheck({ status: 'ok', [ip]: { network: { type: 'Business' } } }, ip),
  ];
  const result = assessQuality({ ip }, intel(readings));
  assert.equal(result.score, null);
  assert.equal(result.scoreBreakdown.anonymity, null);
});

for (const [label, field] of [
  ['Proxy', 'proxy'],
  ['Tor', 'tor'],
  ['Relay', 'relay'],
]) {
  test(`${label} changes both the score evidence and the conclusion`, () => {
    const result = assessQuality(
      coffee,
      intel([reading('ipinfo', 'privacy', label, { ...negative, [field]: true })])
    );
    assert.notEqual(result.kind, 'residential');
    assert.ok(result.scoreBreakdown.anonymity < 92);
    assert.match(
      result.summary,
      new RegExp(label === 'Proxy' ? '代理|Proxy' : label === 'Relay' ? '中继|Relay' : label)
    );
    assert.doesNotMatch(result.summary, /未标 VPN \/ 代理|未见匿名出口/);
  });
}

test('a lone Tor observation is kept even without other dimensions', () => {
  const result = assessQuality({ ip }, intel([reading('ipinfo', 'privacy', 'Tor', { tor: true })]));
  assert.equal(result.kind, 'tor-exit');
  assert.equal(result.scoreBreakdown.anonymity, 5);
  assert.equal(result.scoreBreakdown.cap, 25);
  assert.match(result.summary, /Tor/);
  assert.ok(result.score != null);
  assert.equal(result.scoreStatus, 'provisional');
});

test('one reputation provider stays limited despite many ready usage providers', () => {
  const result = assessQuality(
    coffee,
    intel([
      reading('ipinfo', 'privacy', 'No', negative),
      reading('ip2location', 'usage', 'Residential'),
      reading('proxycheck', 'usage', 'Residential'),
    ])
  );
  assert.ok(result.score != null);
  assert.equal(result.scoreStatus, 'provisional');
  assert.equal(result.scoreReference, true);
  assert.deepEqual(result.evidence.reputation, ['coffee']);
});

test('absent dimensions stay null rather than receiving a numerical prior', () => {
  const bare = assessQuality({ ip });
  assert.equal(bare.score, null);
  assert.equal(bare.scoreBreakdown.reputation, null);
  assert.equal(bare.scoreBreakdown.anonymity, null);
  const trustOnly = assessQuality({ ip, trust_score: 95 });
  // One provider's trust claim is evidence-starved, so the estimate
  // converges toward neutral instead of echoing 95.
  assert.equal(trustOnly.score, 71);
  assert.equal(trustOnly.scoreBreakdown.anonymity, null);
  assert.equal(trustOnly.scoreBreakdown.usage, null);
  assert.equal(trustOnly.scoreStatus, 'provisional');
});

test('changing RDAP registration date cannot change reputation', () => {
  const base = intel([reading('ipinfo', 'privacy', 'No', negative)]);
  const old = assessQuality(coffee, {
    ...base,
    prefix: { registeredAt: '2008-09-04' },
  });
  const fresh = assessQuality(
    coffee,
    { ...base, prefix: { registeredAt: '2026-09-18' } },
    { now: Date.parse('2026-09-19') }
  );
  assert.equal(old.score, fresh.score);
  assert.doesNotMatch(fresh.freshness?.value ?? '', /\+/);
});

test('missing a provider keeps the index limited even when each dimension has multiple sources', () => {
  const result = assessQuality(
    coffee,
    intel([
      reading('ipinfo', 'privacy', 'No', negative),
      reading('ip2location', 'usage', 'Residential'),
      reading('ip2location', 'fraud', '0'),
      reading('scamalytics', 'fraud', '0'),
      reading('proxycheck', 'usage', 'Residential'),
    ])
  );
  assert.ok(result.evidence.fraud.length >= 2);
  assert.ok(result.scoreMissingSources.length > 0);
  assert.ok(result.score != null);
  assert.equal(result.scoreStatus, 'provisional');
  assert.equal(result.scoreReference, true);
});

test('conflicting usage readings from one provider do not depend on reading order', () => {
  const uses = [
    reading('proxycheck', 'usage', 'Residential'),
    reading('proxycheck', 'usage', 'Data Center'),
  ];
  for (const readings of [uses, [...uses].reverse()]) {
    const result = assessQuality({ ip }, intel(readings));
    assert.equal(result.kind, 'disputed');
    assert.equal(result.sources.find((source) => source.id === 'proxycheck').usage, null);
    assert.match(result.summary, /Residential/);
    assert.match(result.summary, /Data Center/);
  }
});

test('Coffee organization ownership stays visible separately from residential usage', () => {
  const result = assessQuality(coffee);
  const source = result.sources.find((source) => source.id === 'coffee');
  assert.equal(source.usage, 'residential');
  assert.equal(source.rows.find((row) => row.label === '组织类型').value, 'government');
  assert.match(result.summary, /government/);
  assert.match(result.summary, /实际接入用途待核实/);
  assert.equal(result.scoreReference, true);
});

test('conflicting reputation readings are unknown regardless of input order', () => {
  const conflicting = [reading('proxycheck', 'risk', '0'), reading('proxycheck', 'fraud', '90')];
  const results = [conflicting, [...conflicting].reverse()].map((readings) =>
    assessQuality(coffee, intel(readings))
  );
  assert.equal(results[0].score, results[1].score);
  for (const result of results) {
    const provider = result.sources.find((source) => source.id === 'proxycheck');
    assert.equal(provider.reputation, null);
    assert.equal(provider.reputationConflict, true);
    assert.match(provider.headline.value, /冲突/);
    assert.deepEqual(result.evidence.reputation, ['coffee']);
    assert.equal(result.scoreReference, true);
  }
});

test('increasing the same provider risk cannot improve the reference index', () => {
  const complete = JSON.parse(
    readFileSync(new URL('../scripts/ip-quality-data/samples.json', import.meta.url))
  ).samples.find((sample) => sample.ip === '208.67.222.222');
  let previous = Infinity;
  for (const risk of [0, 25, 26, 65, 66, 100]) {
    const cross = {
      ...complete.cross,
      readings: complete.cross.readings.map((reading) =>
        reading.source === 'proxycheck' && reading.metric === 'risk'
          ? { ...reading, value: String(risk) }
          : reading
      ),
    };
    const result = assessQuality(complete.coffee, cross, {
      now: Date.parse(complete.collectedAt),
    });
    assert.ok(result.score != null);
    assert.ok(result.score <= previous, `risk ${risk} unexpectedly improved the score`);
    previous = result.score;
  }
});

test('coverage falls when a source remains ready but loses its fraud reading', () => {
  const complete = JSON.parse(
    readFileSync(new URL('../scripts/ip-quality-data/samples.json', import.meta.url))
  ).samples.find((sample) => sample.ip === '208.67.222.222');
  const full = assessQuality(complete.coffee, complete.cross, {
    now: Date.parse(complete.collectedAt),
  });
  const reduced = assessQuality(
    complete.coffee,
    {
      ...complete.cross,
      readings: complete.cross.readings.filter((item) => item.id !== 'ip2location-fraud'),
    },
    { now: Date.parse(complete.collectedAt) }
  );
  assert.ok(full.scoreBreakdown.evidenceCoverage > reduced.scoreBreakdown.evidenceCoverage);
  assert.equal(reduced.sources.find((source) => source.id === 'ip2location')?.status, 'ready');
  assert.equal(reduced.scoreReference, true);
});

test('usage-only responses from several sources do not become a score', () => {
  const result = assessQuality(
    { ip },
    intel([
      reading('ip2location', 'usage', 'Business'),
      reading('proxycheck', 'usage', 'Residential'),
      reading('ipregistry', 'usage', 'ISP'),
    ])
  );
  assert.equal(result.score, null);
  assert.equal(result.scoreStatus, 'unavailable');
  assert.equal(result.scoreBreakdown.confidence, 'low');
  assert.ok(result.scoreBreakdown.evidenceCoverage < 0.75);
});

test('same-source IPQS fraud and VPN do not self-confirm the extreme verdict', () => {
  const result = assessQuality(
    { ip, trust_score: 90 },
    intel([reading('ipqs', 'fraud', '95'), reading('ipqs', 'privacy', 'VPN', { vpn: true })])
  );
  assert.equal(result.scoreBreakdown.cap, 30);
  assert.deepEqual(
    result.scoreBreakdown.penalties.map((item) => item.key),
    ['fraud-extreme']
  );
  assert.notEqual(result.kind, 'high-risk');
});

test('stale checkedAt lowers effective coverage and keeps the result provisional', () => {
  const now = Date.parse('2026-09-23T00:00:00Z');
  const base = {
    ip,
    trust_score: 90,
    is_abuser: false,
    is_vpn: false,
    is_proxy: false,
    is_tor: false,
  };
  const readings = [
    reading('ipinfo', 'privacy', 'No', negative),
    reading('ip2location', 'fraud', '0'),
    reading('scamalytics', 'fraud', '0'),
    reading('proxycheck', 'usage', 'Residential'),
  ];
  const fresh = assessQuality(
    base,
    { ...intel(readings), checkedAt: '2026-09-22T00:00:00Z' },
    { now }
  );
  const stale = assessQuality(
    base,
    { ...intel(readings), checkedAt: '2026-01-01T00:00:00Z' },
    { now }
  );
  assert.ok(stale.scoreBreakdown.evidenceCoverage < fresh.scoreBreakdown.evidenceCoverage);
  assert.equal(stale.scoreBreakdown.confidence, 'low');
  assert.equal(stale.scoreReference, true);
});
