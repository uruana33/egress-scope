import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  dnsFamily,
  dnsGeoLabel,
  dnsHttpPath,
  dnsLaneFamilies,
  dnsLaneGroups,
  dnsLanePath,
  dnsMemberId,
  dnsOperator,
  dnsSourceId,
  geoFromDns,
  groupDnsLanes,
  parseDnsLeafId,
  parseDnsSourceId,
  splitDnsForest,
} from '../src/views/egress/dns-lanes.ts';

test('DNS operators collapse anycast pools and keep IPv4/IPv6 groups', () => {
  assert.equal(dnsFamily('8.8.8.8'), 'ipv4');
  assert.equal(dnsFamily('2001:4860::1'), 'ipv6');
  assert.equal(dnsOperator('US · GOOGLE - Google LLC, US').key, 'google');
  assert.equal(dnsOperator('United States, San Jose · Cloudflare').key, 'cloudflare');
  assert.equal(
    dnsOperator('United States, Santa Clara · Comcast Cable Communications, LLC').label,
    'Comcast'
  );
  assert.equal(dnsOperator('CN · 北京市 · 联通').key, 'unicom');
  assert.equal(dnsOperator('CN · 北京市 · 联通').label, '中国联通');

  const lanes = groupDnsLanes({
    count: 16,
    failed: 1,
    failures: { Surfshark: 1 },
    results: [
      {
        ip: '64.6.64.6',
        geo: 'US · GOOGLE - Google LLC, US',
        country_code: 'US',
        samples: 5,
        sources: ['Fastly'],
        sourceSamples: { Fastly: 5 },
      },
      {
        ip: '64.6.65.6',
        geo: 'United States, Los Angeles · Google LLC',
        country_code: 'US',
        samples: 3,
        sources: ['BrowserLeaks DNS4'],
        sourceSamples: { 'BrowserLeaks DNS4': 3 },
      },
      {
        ip: '2607:f8b0:4004:1001::12c',
        geo: 'United States, Los Angeles · Google LLC',
        country_code: 'US',
        samples: 2,
        sources: ['BrowserLeaks DNS6'],
        sourceSamples: { 'BrowserLeaks DNS6': 2 },
      },
      {
        ip: '1.0.0.2',
        geo: 'United States, San Jose · Cloudflare',
        country_code: 'US',
        samples: 4,
        sources: ['BrowserLeaks DNS4', 'Surfshark'],
        sourceSamples: { 'BrowserLeaks DNS4': 2, Surfshark: 2 },
      },
    ],
  });

  assert.equal(lanes.length, 3);
  assert.deepEqual(
    lanes.map((lane) => lane.key),
    ['google', 'cloudflare', 'blocked']
  );
  const google = lanes[0];
  assert.equal(google.ip, '64.6.64.6');
  assert.equal(google.samples, 10);
  assert.equal(google.members.length, 3);
  assert.deepEqual(dnsLaneFamilies(google), ['ipv4', 'ipv6']);
  assert.deepEqual(
    dnsLaneGroups(google).map((group) => [
      group.key,
      group.sources.map((source) => source.name),
      group.members.map((member) => member.ip),
    ]),
    [
      ['ipv4', ['Fastly', 'BrowserLeaks DNS4'], ['64.6.64.6', '64.6.65.6']],
      ['ipv6', ['BrowserLeaks DNS6'], ['2607:f8b0:4004:1001::12c']],
    ]
  );
  assert.equal(google.geo?.country_code, 'US');
  assert.equal(lanes[1].operatorLabel, 'Cloudflare');
  assert.deepEqual(
    dnsLaneGroups(lanes[1]).map((group) => group.key),
    ['ipv4']
  );
  assert.equal(lanes[2].kind, 'blocked');
  assert.equal(lanes[2].sources[0].name, 'Surfshark');
});

test('DNS geo parsing keeps a country code and splits city names', () => {
  const geo = geoFromDns({
    ip: '8.8.8.8',
    geo: 'United States, Los Angeles · Google LLC',
    country_code: 'US',
  });
  assert.equal(geo.country_code, 'US');
  assert.equal(geo.country, 'United States');
  assert.equal(geo.city, 'Los Angeles');
  assert.equal(geo.isp, 'Google LLC');
});

test('Fastly-style geo collapses to country plus operator', () => {
  assert.equal(
    dnsGeoLabel({
      ip: '1.1.1.1',
      geo: 'US · CLOUDFLARENET - Cloudflare, Inc., US',
      country_code: 'US',
    }),
    'US · Cloudflare'
  );
  assert.equal(
    dnsGeoLabel({
      ip: '1.1.1.1',
      geo: 'United States, San Jose · Cloudflare',
      country_code: 'US',
    }),
    'United States, San Jose · Cloudflare'
  );
});

test('DNS source ids round-trip through the tree', () => {
  const id = dnsSourceId('google', 'ipv6', 'BrowserLeaks DNS6');
  assert.deepEqual(parseDnsSourceId(id), {
    laneKey: 'google',
    groupKey: 'ipv6',
    name: 'BrowserLeaks DNS6',
  });
  const memberId = dnsMemberId('unicom', 'ipv4', '2001:4860::1');
  assert.deepEqual(parseDnsLeafId(memberId), {
    kind: 'member',
    laneKey: 'unicom',
    groupKey: 'ipv4',
    ip: '2001:4860::1',
  });
});

test('the card follows the busier family while group labels stay IPv4 then IPv6', () => {
  const lanes = groupDnsLanes({
    count: 4,
    failed: 0,
    failures: {},
    results: [
      {
        ip: '2001:4860::1',
        geo: 'United States · Google',
        country_code: 'US',
        samples: 8,
        sources: ['BrowserLeaks DNS6'],
        sourceSamples: { 'BrowserLeaks DNS6': 8 },
      },
      {
        ip: '8.8.8.8',
        geo: 'United States · Google',
        country_code: 'US',
        samples: 2,
        sources: ['Fastly'],
        sourceSamples: { Fastly: 2 },
      },
    ],
  });
  assert.equal(lanes[0].ip, '2001:4860::1');
  assert.equal(lanes[0].family, 'ipv6');
  assert.deepEqual(dnsLaneFamilies(lanes[0]), ['ipv4', 'ipv6']);
});

test('busy DNS with no results still draws a pending lane', () => {
  const idle = groupDnsLanes({ results: [], count: 0, failed: 0, failures: {} });
  assert.deepEqual(idle, []);
  const pending = groupDnsLanes({ results: [], count: 2, failed: 0, failures: {} }, true);
  assert.equal(pending[0]?.kind, 'pending');
});

test('China Unicom resolvers from NetEase sit on their own operator lane', () => {
  const lanes = groupDnsLanes({
    count: 5,
    failed: 0,
    failures: {},
    results: [
      {
        ip: '180.76.76.76',
        geo: 'CN · 北京市 · 联通',
        country_code: 'CN',
        samples: 3,
        sources: ['NetEase'],
        sourceSamples: { NetEase: 3 },
      },
      {
        ip: '120.53.53.53',
        geo: 'CN · 北京市 · 联通',
        country_code: 'CN',
        samples: 2,
        sources: ['NetEase'],
        sourceSamples: { NetEase: 2 },
      },
    ],
  });
  assert.equal(lanes.length, 1);
  assert.equal(lanes[0].key, 'unicom');
  assert.equal(lanes[0].operatorLabel, '中国联通');
  assert.equal(lanes[0].members.length, 2);
  assert.deepEqual(
    dnsLaneGroups(lanes[0]).map((group) => group.members.map((member) => member.ip)),
    [['180.76.76.76', '120.53.53.53']]
  );
  assert.equal(lanes[0].sources[0].name, 'NetEase');
  assert.equal(lanes[0].sources[0].meta.group, 'domestic');
  assert.equal(
    dnsGeoLabel({
      ip: '180.76.76.76',
      geo: 'CN · 北京市 · 联通',
      country_code: 'CN',
    }),
    'CN · 中国联通'
  );
});

test('split HTTP exits become two DNS subtrees', () => {
  assert.equal(dnsHttpPath({ ip: '223.6.6.6', path: 'domestic' }), 'domestic');
  assert.equal(dnsHttpPath({ ip: '208.67.222.222', country_code: 'US' }), 'overseas');
  const lanes = groupDnsLanes({
    count: 8,
    failed: 1,
    failures: { Surfshark: 1, NetEase: 1 },
    results: [
      {
        ip: '8.8.8.8',
        geo: 'US · Google',
        country_code: 'US',
        samples: 5,
        sources: ['Surfshark'],
        sourceSamples: { Surfshark: 5 },
      },
      {
        ip: '180.76.76.76',
        geo: 'CN · 北京市 · 联通',
        country_code: 'CN',
        samples: 3,
        sources: ['NetEase'],
        sourceSamples: { NetEase: 3 },
      },
    ],
  });
  assert.equal(dnsLanePath(lanes[0]), 'overseas');
  assert.equal(dnsLanePath(lanes.find((lane) => lane.key === 'unicom')), 'domestic');
  const trees = splitDnsForest(lanes, [
    { ip: '223.6.6.6', path: 'domestic', country_code: 'CN' },
    { ip: '208.67.222.222', path: 'overseas', country_code: 'US' },
  ]);
  assert.deepEqual(
    trees.map((tree) => tree.key),
    ['domestic', 'overseas']
  );
  assert.equal(trees[0].origin?.ip, '223.6.6.6');
  assert.deepEqual(
    trees[0].lanes.filter((lane) => lane.kind === 'exit').map((lane) => lane.key),
    ['unicom']
  );
  assert.ok(trees[0].lanes.some((lane) => lane.kind === 'blocked'));
  assert.deepEqual(
    trees[1].lanes.filter((lane) => lane.kind === 'exit').map((lane) => lane.key),
    ['google']
  );
  assert.equal(
    trees[1].lanes.find((lane) => lane.kind === 'blocked')?.sources[0]?.name,
    'Surfshark'
  );
  const single = splitDnsForest(lanes, [{ ip: '208.67.222.222', path: 'overseas' }]);
  assert.equal(single.length, 1);
  assert.equal(single[0].key, 'all');
});

test('mixed DNS lanes are sliced by source samples instead of duplicated', () => {
  const lanes = groupDnsLanes({
    count: 10,
    failed: 0,
    failures: {},
    results: [
      {
        ip: '1.12.12.12',
        geo: 'CN · 北京 · 中国联通',
        country_code: 'CN',
        samples: 8,
        sources: ['NetEase', 'Fastly'],
        sourceSamples: { NetEase: 3, Fastly: 5 },
      },
    ],
  });
  const trees = splitDnsForest(lanes, [
    { ip: '223.6.6.6', path: 'domestic', country_code: 'CN' },
    { ip: '208.67.222.222', path: 'overseas', country_code: 'US' },
  ]);
  const domestic = trees.find((tree) => tree.key === 'domestic');
  const overseas = trees.find((tree) => tree.key === 'overseas');
  assert.equal(domestic?.lanes[0]?.key, 'unicom:domestic');
  assert.equal(overseas?.lanes[0]?.key, 'unicom:overseas');
  assert.equal(domestic?.lanes[0]?.samples, 3);
  assert.equal(overseas?.lanes[0]?.samples, 5);
  assert.deepEqual(domestic?.lanes[0]?.members[0]?.sourceSamples, {
    NetEase: 3,
  });
  assert.deepEqual(overseas?.lanes[0]?.members[0]?.sourceSamples, {
    Fastly: 5,
  });
  assert.deepEqual(
    domestic?.lanes[0]?.sources.map((source) => source.name),
    ['NetEase']
  );
  assert.deepEqual(
    overseas?.lanes[0]?.sources.map((source) => source.name),
    ['Fastly']
  );
});

test('sliced DNS lane geo stays attached to its representative member', () => {
  const lanes = groupDnsLanes({
    count: 8,
    failed: 0,
    failures: {},
    results: [
      {
        ip: '8.8.8.8',
        geo: 'CN · 北京 · Cloudflare',
        country_code: 'CN',
        samples: 4,
        sources: ['NetEase', 'Fastly'],
        sourceSamples: { NetEase: 3, Fastly: 1 },
      },
      {
        ip: '1.1.1.1',
        geo: 'United States, San Jose · Cloudflare',
        country_code: 'US',
        samples: 4,
        sources: ['NetEase', 'Fastly'],
        sourceSamples: { NetEase: 1, Fastly: 3 },
      },
    ],
  });
  const domestic = splitDnsForest(lanes, [
    { ip: '223.6.6.6', path: 'domestic', country_code: 'CN' },
    { ip: '208.67.222.222', path: 'overseas', country_code: 'US' },
  ]).find((tree) => tree.key === 'domestic');
  const lane = domestic?.lanes.find((item) => item.kind === 'exit');

  assert.equal(lane?.ip, '8.8.8.8');
  assert.equal(lane?.geo?.ip, '8.8.8.8');
  assert.equal(lane?.geo?.country_code, 'CN');
  assert.equal(lane?.geo?.country, '北京');
});

test('two domestic HTTP observations do not fabricate an overseas tree', () => {
  const lanes = groupDnsLanes({
    count: 2,
    failed: 0,
    failures: {},
    results: [
      {
        ip: '180.76.76.76',
        geo: 'CN · 北京 · 联通',
        country_code: 'CN',
        samples: 1,
        sources: ['NetEase'],
        sourceSamples: { NetEase: 1 },
      },
    ],
  });
  const trees = splitDnsForest(lanes, [
    { ip: '223.6.6.6', country_code: 'CN' },
    { ip: '223.5.5.5', country_code: 'CN' },
  ]);
  assert.deepEqual(
    trees.map((tree) => tree.key),
    ['all']
  );
});

test('multiple DNS resolver addresses are not labeled as different HTTP exits', () => {
  const lanes = groupDnsLanes({
    count: 4,
    failed: 0,
    failures: {},
    results: [
      {
        ip: '8.8.8.8',
        geo: 'US · Google',
        country_code: 'US',
        samples: 2,
        sources: ['Fastly'],
        sourceSamples: { Fastly: 2 },
      },
      {
        ip: '8.8.4.4',
        geo: 'US · Google',
        country_code: 'US',
        samples: 2,
        sources: ['Fastly'],
        sourceSamples: { Fastly: 2 },
      },
    ],
  });
  assert.equal(
    lanes.reduce((count, lane) => count + lane.members.length, 0),
    2
  );
});

test('DNS lane geo and representative IP come from the same member', () => {
  const lanes = groupDnsLanes({
    count: 6,
    failed: 0,
    failures: {},
    results: [
      {
        ip: '8.8.8.8',
        geo: 'CN · 北京 · Cloudflare',
        country_code: 'CN',
        samples: 5,
        sources: ['Fastly'],
        sourceSamples: { Fastly: 5 },
      },
      {
        ip: '1.1.1.1',
        geo: 'United States, San Jose · Cloudflare',
        country_code: 'US',
        samples: 1,
        sources: ['Surfshark'],
        sourceSamples: { Surfshark: 1 },
      },
    ],
  });

  assert.equal(lanes[0]?.ip, '8.8.8.8');
  assert.equal(lanes[0]?.geo?.ip, '8.8.8.8');
  assert.equal(lanes[0]?.geo?.country_code, 'CN');
  assert.equal(lanes[0]?.geo?.country, '北京');
  assert.equal(lanes[0]?.geo?.city, undefined);
});
