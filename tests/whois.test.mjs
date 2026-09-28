import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as jsxRuntime from 'react/jsx-runtime';
import ts from 'typescript';

const { outputText } = ts.transpileModule(readFileSync('src/views/whois/index.tsx', 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
  },
});

const cachedRegistration = {
  source: 'RDAP · 注册记录',
  query: 'example.com',
  data: {
    ldhName: 'EXAMPLE.COM',
    objectClassName: 'ip network',
    handle: 'NET-EXAMPLE',
    events: [{ eventAction: 'registration', eventDate: '2024-01-01T00:00:00Z' }],
    status: ['clientTransferProhibited'],
    entities: [
      {
        handle: 'handle376',
        roles: ['registrant'],
        vcardArray: ['vcard', [['fn', {}, 'text', 'Example Organisation']]],
      },
    ],
  },
};

function loadWhois({ cached, result, lookupResult = cached?.data }) {
  let queryOptions;
  const effects = [];
  const saved = [];
  const SnapshotNotice = (props) => ({ type: 'SnapshotNotice', props });
  function FolioCards(props) {
    return { type: 'FolioCards', props };
  }
  const require = (name) => {
    if (name === 'react/jsx-runtime') return jsxRuntime;
    if (name === 'react') return { useEffect: (effect) => effects.push(effect) };
    if (name === '@/components/toolkit')
      return {
        ErrorNotice: (props) => ({ type: 'ErrorNotice', props }),
        Pending: (props) => ({ type: 'Pending', props }),
      };
    if (name === '@/hooks/use-lookup-history')
      return {
        useLookupHistory: () => ({
          find: () => cached,
          save: (...args) => saved.push(args),
        }),
      };
    if (name === '@/i18n') return { locale: 'zh-CN', t: (value) => value };
    if (name === '@/views/ip/components/snapshot-notice') return { SnapshotNotice };
    if (name === '@/views/lookup/folio-cards') return { FolioCards };
    if (name === '@tanstack/react-query')
      return {
        useQuery: (options) => {
          queryOptions = options;
          return result;
        },
      };
    if (name === './api')
      return {
        lookupWhois: async () => lookupResult,
      };
    throw new Error(`Unexpected import: ${name}`);
  };

  const exports = {};
  new Function('require', 'exports', outputText)(require, exports);
  const tree = exports.default({ query: 'example.com' });
  return { effects, queryOptions, saved, tree, FolioCards, SnapshotNotice };
}

function findNode(node, predicate) {
  if (!node || typeof node !== 'object') return undefined;
  if (predicate(node)) return node;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findNode(item, predicate);
      if (found) return found;
    }
    return undefined;
  }
  return findNode(node.props?.children, predicate);
}

test('WHOIS uses a finite placeholder snapshot and persists only live results', async () => {
  const cached = { data: cachedRegistration, savedAt: 1_700_000_000_000 };
  const snapshot = loadWhois({
    cached,
    result: {
      data: cachedRegistration,
      isPlaceholderData: true,
      isFetching: true,
    },
  });

  assert.equal(snapshot.queryOptions.placeholderData, cached.data);
  assert.equal(snapshot.queryOptions.staleTime, 5 * 60_000);
  assert.equal(snapshot.queryOptions.gcTime, 30 * 60_000);
  await snapshot.queryOptions.queryFn({ signal: new AbortController().signal });
  snapshot.effects[0]();
  assert.equal(snapshot.saved.length, 0);
  assert.ok(findNode(snapshot.tree, (node) => node.type === snapshot.SnapshotNotice));

  const live = {
    ...cachedRegistration,
    source: 'RDAP · 注册记录',
    data: { ...cachedRegistration.data, handle: 'NET-LIVE' },
  };
  const fresh = loadWhois({
    cached,
    result: { data: live, isPlaceholderData: false, isFetching: false },
  });
  fresh.effects[0]();
  assert.deepEqual(fresh.saved, [['example.com', live]]);
});

test('WHOIS keeps the local snapshot visible when the refresh observer has no data', () => {
  const cached = { data: cachedRegistration, savedAt: 1_700_000_000_000 };
  const failed = loadWhois({
    cached,
    result: {
      data: undefined,
      error: new Error('upstream failed'),
      isPlaceholderData: false,
      isFetching: false,
    },
  });
  const cards = findNode(failed.tree, (node) => node.type === failed.FolioCards);
  assert.ok(cards);
  const values = cards.props.items.map((item) => [item.label, item.value]);
  assert.ok(values.some(([label, value]) => label === '对象类型' && value === 'IP 网络'));
  assert.ok(values.some(([label, value]) => label === '注册' && String(value).includes('2024')));
  assert.ok(values.some(([label, value]) => label === '域名状态' && value === '客户端禁止转移'));
  assert.ok(
    values.some(([label, value]) => label === '注册人' && value === 'Example Organisation')
  );
  const rendered = JSON.stringify(failed.tree);
  assert.ok(rendered.includes('仍显示上次成功结果。'));
  assert.ok(rendered.includes('上次读取于'));
});

test('WHOIS live data retained after refetch failure is marked as an old result', () => {
  const failed = loadWhois({
    cached: { data: cachedRegistration, savedAt: 1700000000000 },
    result: {
      data: cachedRegistration,
      error: new Error('refetch failed'),
      isPlaceholderData: false,
      isFetching: false,
      dataUpdatedAt: 1700000100000,
    },
  });
  const rendered = JSON.stringify(failed.tree);
  assert.match(rendered, /仍显示上次成功结果/);
  assert.match(rendered, /上次读取于/);
  failed.effects[0]();
  assert.equal(failed.saved.length, 0);
});
