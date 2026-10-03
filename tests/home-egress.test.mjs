import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as jsx from 'react/jsx-runtime';
import ts from 'typescript';

import * as queryKeyModule from '../src/lib/query-keys.ts';
import * as shareReport from '../src/lib/share-report.ts';
import * as overview from '../src/views/home/overview.ts';
import * as quality from '../src/views/ip/model/quality.ts';

const { outputText } = ts.transpileModule(readFileSync('src/views/home/index.tsx', 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
  },
});
function render(primary, split, client = {}, capture = () => {}, extraBatches = []) {
  const batches = [primary, ...extraBatches];
  const require = (name) => {
    if (name === 'react/jsx-runtime') return jsx;
    if (name === './overview') return overview;
    if (name === '@/views/ip/model/quality') return quality;
    if (name === 'react')
      return {
        useEffect() {},
        useState: (value) => [typeof value === 'function' ? value() : value, () => {}],
        useMemo: (fn) => fn(),
      };
    if (name === '@/lib/share-report') return shareReport;
    if (name === '@/i18n') return { t: (text) => text };
    if (name === '@/hooks/use-mobile') return { useIsMobile: () => false };
    if (name === '@/hooks/use-sort-animation') return { useSortAnimation: () => null };
    if (name === '@/lib/query-keys') return queryKeyModule;
    if (name === './sites.json') return [{ name: 'Example' }];
    if (name === '@tanstack/react-query')
      return {
        useQueryClient: () => client,
        useQueries: ({ queries }) => batches.shift() ?? queries.map(() => ({ isPending: false })),
      };
    return new Proxy({}, { get: (_, key) => key });
  };
  const exports = {};
  new Function('require', 'exports', outputText)(require, exports);
  const tree = exports.HomePage();
  capture(tree);
  return JSON.stringify(tree);
}
const failed = { isPending: false, isError: true };
const ipv4 = { ip: '192.0.2.1' };
const ipv6 = { ip: '2001:db8::1' };

test('domestic egress comes first and external IPv4 remains separate', () => {
  const proxy = { ip: '192.0.2.2' };
  const result = render(
    [{ data: ipv4 }, { data: proxy }, failed],
    [{ data: ipv6 }, { data: { ip: '192.0.2.3' } }]
  );
  assert.ok(result.indexOf(ipv4.ip) < result.indexOf(proxy.ip));
  assert.ok(result.includes('IPv4 · 国内探测'));
  assert.ok(result.includes('IPv4 · 外部探测'));
  assert.ok(!result.includes(ipv6.ip));
  assert.ok(!result.includes('192.0.2.3'));
});
test('matching domestic and external IPv4 produces one card', () => {
  let tree;
  render([{ data: ipv4 }, { data: ipv4 }, failed], [], {}, (value) => {
    tree = value;
  });
  const visualizer = tree.props.children.find(
    (child) => child && child.props && Array.isArray(child.props.cardsData)
  );
  assert.equal(visualizer.props.cardsData.length, 1);
});

test('homepage uses the same disputed estimate and evidence as the IP dossier', () => {
  const sample = JSON.parse(readFileSync('scripts/ip-quality-data/samples.json')).samples.find(
    (sample) => sample.ip === '223.5.5.5'
  );
  // Corpus evidence ages on the wall clock; refresh checkedAt so the score
  // assertion stays date-independent.
  const cross = { ...sample.cross, checkedAt: new Date().toISOString() };
  let tree;
  render(
    [{ data: { ip: sample.ip } }, failed],
    [],
    {},
    (value) => {
      tree = value;
    },
    [
      [{ data: { ip: sample.ip, country: 'China' } }],
      [{ isSuccess: true, data: { coffee: sample.coffee } }],
      [{ data: cross }],
    ]
  );
  const card = tree.props.children.find((child) => child?.props?.cardsData).props.cardsData[0];
  assert.equal(card.assessment.kind, 'disputed');
  assert.equal(card.assessment.scoreStatus, 'provisional');
  assert.equal(card.score, 92);
  assert.ok(!card.typeLabels.some((label) => label.label === '家庭住宅 IP'));
  assert.equal(card.assessment.keyEvidence.rows.length, 3);
});

test('refetch failures keep previous classification and cross evidence explicitly stale', () => {
  const sample = JSON.parse(readFileSync('scripts/ip-quality-data/samples.json')).samples.find(
    (sample) => sample.ip === '223.5.5.5'
  );
  const cross = { ...sample.cross, checkedAt: new Date().toISOString() };
  let tree;
  render(
    [{ data: { ip: sample.ip } }, failed],
    [],
    {},
    (value) => {
      tree = value;
    },
    [
      [{ data: { ip: sample.ip } }],
      [{ isSuccess: false, isError: true, data: { coffee: sample.coffee } }],
      [{ isError: true, data: cross }],
    ]
  );
  const card = tree.props.children.find((child) => child?.props?.cardsData).props.cardsData[0];
  assert.equal(card.stale, true);
  assert.equal(card.probeStale, false);
  assert.equal(card.score, 92);
  assert.equal(card.assessment.kind, 'disputed');
});
test('a failed egress refresh marks only that observed route stale', () => {
  let tree;
  render([{ data: ipv4, isError: true }, { data: { ip: '192.0.2.2' } }], [], {}, (value) => {
    tree = value;
  });
  const cards = tree.props.children.find((child) => child?.props?.cardsData).props.cardsData;
  assert.equal(cards.find((card) => card.role === 'domestic').probeStale, true);
  assert.equal(cards.find((card) => card.role === 'external').probeStale, false);
});
test('failed domestic probe never promotes a proxy or routed IPv6 to local egress', () => {
  let tree;
  const result = render([failed, { data: ipv4 }, failed], [{ data: ipv6 }], {}, (value) => {
    tree = value;
  });
  const visualizer = tree.props.children.find((child) => child?.props?.cardsData);
  assert.equal(visualizer.props.domesticIp, undefined);
  assert.equal(visualizer.props.overseasIp, ipv4.ip);
  assert.ok(!result.includes('未获取到 IPv'));
  assert.ok(result.includes('IPv4 · 外部探测'));
  assert.ok(!result.includes(ipv6.ip));
});
test('IPv6 and failed probes do not create overview cards', () => {
  const result = render([{ data: ipv4 }, failed, { data: ipv6 }], []);
  assert.ok(!result.includes('IPv6 · 外部探测'));
  assert.ok(!result.includes(ipv6.ip));
});

test('home retest cancels previous runs before resetting only home query families', async () => {
  const calls = [];
  const client = {
    cancelQueries: async (filters) => {
      assert.ok(filters.predicate({ queryKey: ['browser-ip', 4] }));
      assert.ok(filters.predicate({ queryKey: ['split', 'Example'] }));
      assert.ok(
        !filters.predicate({
          queryKey: ['connectivity', 'https://example.com', 0],
        })
      );
      assert.ok(!filters.predicate({ queryKey: ['whois', 'example.com'] }));
      calls.push('cancel');
    },
    resetQueries: async () => {
      calls.push('reset');
    },
  };
  let refresh;
  render([failed, failed, failed], [], client, (tree) => {
    refresh = tree.props.children[0].props.children[1].props.onClick;
  });
  await refresh();
  assert.deepEqual(calls, ['cancel', 'reset']);
});
