import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { assessQuality } from '../src/views/ip/model/quality.ts';
import { buildReport } from '../src/views/ip/model/report.ts';

const corpus = JSON.parse(
  readFileSync(new URL('../scripts/ip-quality-data/samples.json', import.meta.url))
);
const complete = corpus.samples.find((sample) => sample.ip === '208.67.222.222');
const now = Date.parse(complete.collectedAt);
const run = (coffee, cross) => assessQuality(coffee, cross, { now });

test('losing a provider preserves an explicitly provisional score', () => {
  const baseline = run(complete.coffee, complete.cross);
  assert.ok(baseline.score != null);
  assert.equal(baseline.scoreStatus, 'ready');
  for (const source of baseline.sources.filter((source) => source.status === 'ready')) {
    const coffee = source.id === 'coffee' ? { ip: complete.ip } : complete.coffee;
    const cross = {
      ...complete.cross,
      readings: complete.cross.readings.filter((reading) => reading.source !== source.id),
    };
    const result = run(coffee, cross);
    assert.ok(result.score != null, source.id);
    assert.equal(result.scoreStatus, 'provisional');
    assert.ok(result.scoreMissingSources.includes(source.id));
    assert.equal(result.scoreReference, true);
  }
});

test('a ready provider without its reputation metric is excluded from the estimate', () => {
  const cross = {
    ...complete.cross,
    readings: complete.cross.readings.filter(
      (reading) => reading.source !== 'ip2location' || reading.metric !== 'fraud'
    ),
  };
  const result = run(complete.coffee, cross);
  assert.equal(result.sources.find((source) => source.id === 'ip2location').status, 'ready');
  assert.ok(result.score != null);
  assert.equal(result.scoreStatus, 'provisional');
  assert.ok(result.scoreBreakdown.reputation != null);
  assert.ok(!result.evidence.reputation.includes('ip2location'));
  assert.ok(result.scoreMissingSources.includes('ip2location'));
});

test('a partially parsed anonymity provider is disclosed without hiding other evidence', () => {
  const cross = {
    ...complete.cross,
    readings: complete.cross.readings.map((reading) =>
      reading.source === 'ipinfo' && reading.metric === 'privacy'
        ? { ...reading, flags: { vpn: false } }
        : reading
    ),
  };
  const result = run(complete.coffee, cross);
  assert.ok(result.score != null);
  assert.equal(result.scoreStatus, 'provisional');
  assert.ok(result.scoreMissingSources.includes('ipinfo'));
});

test('missing-source reasons survive in the copy report', () => {
  const cross = {
    ...complete.cross,
    readings: complete.cross.readings.filter((reading) => reading.source !== 'ip2location'),
  };
  const quality = assessQuality(complete.coffee, cross);
  const text = buildReport({ coffee: complete.coffee }, cross);
  assert.match(text, /估算/);
  assert.match(text, /缺少.*IP2Location/);
  assert.match(text, new RegExp(`质量分 ${quality.score}`));
});

test('IPv6 uses a declared four-source profile and IPPure is inapplicable', () => {
  const sample = corpus.samples.find((sample) => sample.ip === '2606:4700:4700::1111');
  const result = run(sample.coffee, sample.cross);
  assert.equal(result.scoreProfile, 'ipv6-four-source');
  assert.ok(!result.scoreMissingSources.includes('ippure'));
  assert.equal(result.sources.find((source) => source.id === 'ippure').status, 'not-applicable');
  assert.ok(result.score != null);
  const missing = {
    ...sample.cross,
    readings: sample.cross.readings.filter((reading) => reading.source !== 'scamalytics'),
  };
  assert.ok(run(sample.coffee, missing).score != null);
  assert.equal(run(sample.coffee, missing).scoreStatus, 'provisional');
});

test('official public DNS usage survives Coffee loss without adding reputation or anonymity votes', () => {
  for (const sample of corpus.samples.filter((sample) => sample.coffee.is_public_service)) {
    const result = assessQuality({ ip: sample.ip }, sample.cross, {
      now: Date.parse(sample.collectedAt),
    });
    assert.equal(result.kind, 'public-service', sample.ip);
    assert.ok(result.publicService?.href.startsWith('https://'));
    assert.ok(result.score != null);
    assert.equal(result.scoreStatus, 'provisional');
    assert.ok(!result.evidence.reputation.includes('official'));
    assert.ok(!result.evidence.anonymity.includes('official'));
  }
});

test('public service metadata neither hides Tor evidence nor manufactures clean readings', () => {
  const onlyIdentity = assessQuality({ ip: '1.1.1.1' }, null, { now });
  assert.equal(onlyIdentity.kind, 'public-service');
  assert.equal(onlyIdentity.score, null);
  assert.deepEqual(onlyIdentity.evidence.reputation, []);
  assert.deepEqual(onlyIdentity.evidence.anonymity, []);
  const tor = assessQuality(
    { ip: '1.1.1.1' },
    {
      ip: '1.1.1.1',
      readings: [
        {
          id: 'ipinfo-privacy',
          source: 'ipinfo',
          metric: 'privacy',
          value: 'Tor',
          flags: { tor: true },
          hint: '',
          tone: 'bad',
          href: 'https://ipinfo.io/1.1.1.1',
        },
      ],
      unavailable: [],
    },
    { now }
  );
  assert.equal(tor.kind, 'tor-exit');
  assert.equal(tor.scoreBreakdown.cap, 25);
  assert.ok(tor.publicService);
  assert.match(tor.summary, /Tor/);
});
