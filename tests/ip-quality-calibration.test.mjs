import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { evaluateCorpus, validateCorpus } from '../scripts/ip-quality-calibration.mjs';

const timestamp = '2026-09-19T00:00:00.000Z';
const ip = '1.1.1.1';
const source = {
  url: 'https://developers.cloudflare.com/1.1.1.1/ip-addresses/',
  excerpt: '1.1.1.1 and 1.0.0.1 are public resolver addresses.',
  fetchedAt: timestamp,
};
const label = {
  id: 'cloudflare-primary',
  ip,
  group: 'cloudflare-resolver',
  expectedKind: 'public-service',
  scope: 'usage',
  confidence: 'official',
  observedAt: timestamp,
  source,
};
const makeSample = (changes = {}) => ({
  id: 'observed',
  ip,
  collectedAt: timestamp,
  coffee: {
    ip,
    is_public_service: true,
    trust_score: 90,
    is_vpn: false,
    is_proxy: false,
    is_tor: false,
  },
  cross: { ip, readings: [], unavailable: [] },
  acquisition: {
    coffee: { url: `https://ip.net.coffee/api/ip/lookup/${ip}`, ok: true },
    cross: { url: `http://127.0.0.1:5137/api/ip/cross/${ip}`, ok: true },
  },
  ...changes,
});
const samples = (...items) => ({ schemaVersion: 1, samples: items });
const labels = (...items) => ({ schemaVersion: 1, labels: items });

test('independent labels, unlabelled observations and acquisition failures have separate denominators', () => {
  const unlabelled = makeSample({
    id: 'unlabelled',
    ip: '8.8.8.8',
    coffee: { ip: '8.8.8.8' },
    cross: { ip: '8.8.8.8', readings: [], unavailable: [] },
  });
  const missing = makeSample({
    coffee: null,
    cross: null,
    acquisition: {
      coffee: {
        url: `https://ip.net.coffee/api/ip/lookup/${ip}`,
        ok: false,
        error: 'timeout',
      },
      cross: {
        url: `http://127.0.0.1:5137/api/ip/cross/${ip}`,
        ok: false,
        error: 'timeout',
      },
    },
  });
  const a = evaluateCorpus(samples(makeSample(), unlabelled), labels(label));
  assert.equal(a.compared, 0);
  assert.equal(a.agreements, 0);
  assert.equal(a.catalogueBacked, 1);
  assert.equal(a.catalogueAgreements, 1);
  assert.equal(a.rows[0].agreement, null);
  assert.equal(a.rows[1].agreement, null);
  assert.equal(a.calibrationReady, false);
  const b = evaluateCorpus(samples(missing), labels(label));
  assert.equal(b.compared, 0);
  assert.deepEqual(b.unobserved, ['observed']);
  assert.equal(b.rows[0].score, null);
  const empty = evaluateCorpus(samples(makeSample({ coffee: { ip } })), labels(label));
  assert.equal(empty.compared, 0);
  assert.deepEqual(empty.unobserved, ['observed']);
});

test('partial and stale label observations cannot inflate agreement', () => {
  const stale = evaluateCorpus(
    samples(makeSample({ collectedAt: '2027-01-01T00:00:00Z' })),
    labels(label)
  );
  assert.equal(stale.compared, 0);
  assert.deepEqual(stale.timeMismatches, ['observed']);
  const missing = evaluateCorpus(samples(), labels(label));
  assert.deepEqual(missing.missingLabels, [label.id]);
});

test('wrong-target snapshots, duplicate ids and self-labelled providers are rejected', () => {
  assert.throws(
    () => validateCorpus(samples(makeSample({ coffee: { ip: '8.8.8.8' } })), labels(label)),
    /wrong IP/
  );
  assert.throws(
    () => validateCorpus(samples(makeSample(), makeSample({ id: 'observed' })), labels(label)),
    /Duplicate samples id/
  );
  assert.doesNotThrow(() =>
    validateCorpus(
      samples(
        makeSample({ id: 'first', collectedAt: timestamp }),
        makeSample({
          id: 'second',
          collectedAt: '2026-09-20T00:00:00.000Z',
          cross: {
            ip,
            checkedAt: '2026-09-20T00:00:00.000Z',
            readings: [],
            unavailable: [],
          },
        })
      ),
      labels(label)
    )
  );
  const v6a = { ...label, id: 'a', ip: '2606:4700:4700::1111' };
  const v6b = { ...label, id: 'b', ip: '2606:4700:4700:0:0:0:0:1111' };
  assert.doesNotThrow(() => validateCorpus(samples(), labels(v6a, v6b)));
  assert.throws(
    () =>
      validateCorpus(
        samples(),
        labels({
          ...label,
          source: { ...source, url: 'https://ipinfo.io/1.1.1.1' },
        })
      ),
    /label source URL host is not allowlisted/
  );
});

test('source, reading and acquisition URLs are restricted to their owning domains', () => {
  assert.throws(
    () =>
      validateCorpus(
        samples(
          makeSample({
            cross: {
              ip,
              readings: [
                {
                  id: 'x',
                  source: 'ipinfo',
                  metric: 'privacy',
                  value: 'No',
                  hint: '',
                  tone: 'good',
                  href: 'https://evil.example/ip',
                },
              ],
              unavailable: [],
            },
          })
        ),
        labels(label)
      ),
    /URL host is not allowlisted/
  );
  assert.throws(
    () =>
      validateCorpus(
        samples(
          makeSample({
            acquisition: {
              coffee: {
                url: 'https://evil.example/lookup',
                ok: true,
              },
              cross: {
                url: `http://127.0.0.1:5137/api/ip/cross/${ip}`,
                ok: true,
              },
            },
          })
        ),
        labels(label)
      ),
    /coffee acquisition URL host is not allowlisted/
  );
  assert.throws(
    () =>
      validateCorpus(
        samples(),
        labels({
          ...label,
          source: { ...source, url: 'https://ipinfo.io/1.1.1.1' },
        })
      ),
    /label source URL host is not allowlisted/
  );
});

test('scope matching uses the corresponding dimension and supports narrow dynamic windows', () => {
  const wrongScope = {
    ...label,
    id: 'bad-scope',
    scope: 'anonymity',
  };
  assert.throws(
    () => validateCorpus(samples(), labels(wrongScope)),
    /scope cannot label public-service/
  );
  const dynamic = {
    ...label,
    id: 'dynamic',
    alignmentWindowHours: 1,
  };
  const sample = makeSample({
    id: 'dynamic-sample',
    collectedAt: '2026-09-19T12:00:00.000Z',
    cross: {
      ip,
      checkedAt: '2026-09-19T00:30:00.000Z',
      readings: [],
      unavailable: [],
    },
  });
  const report = evaluateCorpus(samples(sample), labels(dynamic));
  assert.equal(report.rows[0].labelStatus, 'catalogue-backed');
  const stale = evaluateCorpus(
    samples({
      ...sample,
      id: 'dynamic-stale',
      cross: { ...sample.cross, checkedAt: '2026-09-19T02:00:00.000Z' },
    }),
    labels(dynamic)
  );
  assert.equal(stale.rows[0].labelStatus, 'time-mismatch');
});

test('omitting a sole reputation source produces unknown, never an invented zero', () => {
  const r = evaluateCorpus(samples(makeSample()), labels(label));
  const removed = r.rows[0].omissions.find((row) => row.excluded.includes('coffee'));
  assert.equal(removed.score, null);
  assert.equal(removed.limited, true);
  assert.deepEqual(removed.evidence.reputation, []);
  assert.ok(r.rows[0].sensitivity.min <= r.rows[0].score);
  assert.ok(r.rows[0].sensitivity.max >= r.rows[0].score);
});

test('evaluation is deterministic and does not mutate frozen inputs', () => {
  const input = samples(makeSample());
  const truth = labels(label);
  const before = JSON.stringify({ input, truth });
  const first = evaluateCorpus(input, truth);
  const second = evaluateCorpus(input, truth);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify({ input, truth }), before);
});

test('ambiguous duplicate provider measurements cannot enter the frozen corpus', () => {
  const makeReading = (id, metric, value) => ({
    id,
    source: 'proxycheck',
    metric,
    value,
    hint: '',
    tone: 'neutral',
    href: 'https://proxycheck.io/v3/1.1.1.1',
  });
  for (const readings of [
    [makeReading('a', 'risk', '0'), makeReading('a', 'usage', 'Business')],
    [makeReading('a', 'risk', '0'), makeReading('b', 'risk', '90')],
    [makeReading('a', 'risk', '0'), makeReading('b', 'fraud', '90')],
  ])
    assert.throws(
      () =>
        validateCorpus(
          samples(makeSample({ cross: { ip, readings, unavailable: [] } })),
          labels(label)
        ),
      /Duplicate|Multiple reputation/
    );
});

test('frozen real observations preserve independently documented public-service identities', () => {
  const observed = JSON.parse(
    readFileSync(new URL('../scripts/ip-quality-data/samples.json', import.meta.url), 'utf8')
  );
  const documented = JSON.parse(
    readFileSync(new URL('../scripts/ip-quality-data/labels.json', import.meta.url), 'utf8')
  );
  const result = evaluateCorpus(observed, documented);
  const reversed = evaluateCorpus(
    {
      ...observed,
      samples: observed.samples.map((sample) => ({
        ...sample,
        cross: sample.cross
          ? { ...sample.cross, readings: [...sample.cross.readings].reverse() }
          : null,
      })),
    },
    documented
  );
  assert.deepEqual(
    result.rows.map((row) => ({
      ip: row.ip,
      score: row.score,
      kind: row.kind,
    })),
    reversed.rows.map((row) => ({
      ip: row.ip,
      score: row.score,
      kind: row.kind,
    }))
  );
  assert.equal(result.compared, 0);
  assert.equal(result.catalogueBacked, 8);
  assert.equal(result.catalogueAgreements, 8);
  assert.ok(result.groups.length >= 3);
  assert.deepEqual(result.disagreements, []);
  for (const row of result.rows)
    for (const omitted of row.omissions) {
      assert.equal(omitted.limited, true);
      assert.ok(omitted.score != null);
      assert.equal(omitted.scoreStatus, 'provisional');
      if (row.publicService) assert.equal(omitted.kind, 'public-service');
    }
  for (const address of ['124.126.3.108', '74.120.253.118']) {
    const row = result.rows.find((item) => item.ip === address);
    assert.equal(row.labelStatus, 'unlabelled');
    assert.equal(row.agreement, null);
  }
});
