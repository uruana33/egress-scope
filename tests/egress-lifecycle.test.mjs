import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { createStore } from 'jotai/vanilla';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as jsx from 'react/jsx-runtime';
import ts from 'typescript';

import * as diagnostics from '../src/lib/diagnostics.ts';
import * as queryKeys from '../src/lib/query-keys.ts';
import { providers } from '../src/views/cdn/providers.ts';
import { egressRunAtoms } from '../src/views/egress/run-state.ts';
import { sourceRegistry } from '../src/views/home/source-registry.ts';

function harness(file, queryResults = {}) {
  const store = createStore();
  let state = [];
  let cursor = 0;
  let options = [];
  let references = [];
  const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  const result = (q) => {
    options.push(q);
    return {
      isFetching: false,
      isPending: false,
      ...queryResults[q.queryKey[0]],
    };
  };
  const require = (name) => {
    if (name === 'react/jsx-runtime') return jsx;
    if (name === 'react')
      return {
        useEffect() {},
        useRef: (current) => ({ current }),
        useState(initial) {
          const i = cursor++;
          if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial;
          return [
            state[i],
            (next) => {
              state[i] = typeof next === 'function' ? next(state[i]) : next;
            },
          ];
        },
      };
    if (name === '@/views/egress/run-state')
      return {
        useEgressRun(scope) {
          return [
            store.get(egressRunAtoms[scope]),
            (next) => store.set(egressRunAtoms[scope], next),
          ];
        },
      };
    if (name === '@/i18n') return { t: (text) => text };
    if (name === './source-registry') return { sourceRegistry };
    if (name === './providers') return { providers };
    if (name === '@/lib/query-keys') return queryKeys;
    if (name === '@/lib/diagnostics') return diagnostics;
    if (name === '@/views/egress/use-http-exits')
      return {
        useEgressHttpExits: (scope, round) => {
          references.push({ scope, round });
          return { httpExits: [], busy: false };
        },
      };
    if (name === '@tanstack/react-query')
      return {
        useQueries: ({ queries }) => queries.map(result),
        useQuery: result,
        useQueryClient: () => ({ setQueryData() {} }),
      };
    return new Proxy({}, { get: (_, key) => key });
  };
  const exports = {};
  new Function('require', 'exports', outputText)(require, exports);
  const component = exports.default ?? exports.SplitResults;
  return {
    render() {
      cursor = 0;
      options = [];
      references = [];
      const tree = component({});
      return { tree, options, references };
    },
    remount() {
      state = [];
    },
  };
}

function findRows(node) {
  if (!node || typeof node !== 'object') return;
  if (node.props?.rows) return node.props.rows;
  for (const child of [].concat(node.props?.children ?? [])) {
    const found = findRows(child);
    if (found) return found;
  }
}

test('split does not publish cached success while refetching or after a query error', async () => {
  const client = new QueryClient();
  const queryKey = queryKeys.queryKeys.home.split(sourceRegistry[0].id, 0);
  const previous = { status: 'ok', ip: '8.8.8.8' };
  client.setQueryData(queryKey, previous, { updatedAt: Date.now() - 61_000 });
  const observer = new QueryObserver(client, {
    queryKey,
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      throw Error('Unexpected probe rejection');
    },
  });
  try {
    const error = await observer.refetch();
    assert.equal(error.data, previous);
    for (const result of [error, { ...error, isError: false, isFetching: true }]) {
      const { tree } = harness('src/views/home/split-results.tsx', {
        split: result,
      }).render();
      const rows = findRows(tree);
      assert.ok(rows.every((row) => row.geo === undefined));
      if (result.isFetching)
        assert.ok(rows.every((row) => row.diagnostic === undefined && row.pending));
      else assert.ok(rows.every((row) => row.diagnostic?.status === 'network_error'));
    }
  } finally {
    client.clear();
  }
});

test('split keeps a current IP without attaching failed or refreshing cached geo', () => {
  for (const geo of [{ isError: true }, { isFetching: true }]) {
    const { tree } = harness('src/views/home/split-results.tsx', {
      split: { data: { status: 'ok', ip: '8.8.8.8' } },
      geo: { data: { ip: '8.8.8.8', country: 'Old country' }, ...geo },
    }).render();
    const rows = findRows(tree);
    assert.ok(rows.every((row) => row.geo?.ip === '8.8.8.8'));
    assert.ok(rows.every((row) => row.geo.country === undefined));
  }
});

test("DNS refetch failure keeps this run's failed progress instead of cached success", async () => {
  const client = new QueryClient();
  const queryKey = ['dns-exit', 0];
  const previous = {
    results: [{ ip: '8.8.8.8' }],
    clients: [],
    count: 21,
    failed: 0,
    failures: {},
  };
  const current = {
    results: [],
    clients: [],
    count: 21,
    failed: 21,
    failures: {
      Fastly: 5,
      Surfshark: 5,
      NetEase: 5,
      'BrowserLeaks DNS4': 3,
      'BrowserLeaks DNS6': 3,
    },
  };
  client.setQueryData(queryKey, previous);
  const observer = new QueryObserver(client, {
    queryKey,
    retry: false,
    queryFn: async () => {
      throw Error('This run failed');
    },
  });
  try {
    const query = await observer.refetch();
    assert.equal(query.data, previous);
    const { tree } = harness('src/views/dns-exit/index.tsx', {
      'dns-exit-progress': { data: current },
      'dns-exit': query,
    }).render();
    assert.equal(tree.props.children[0].props.state, current);
  } finally {
    client.clear();
  }
});

function findAction(node) {
  if (!node || typeof node !== 'object') return;
  if (node.props?.onClick) return node.props.onClick;
  for (const child of [node.props?.action, ...[].concat(node.props?.children ?? [])]) {
    const found = findAction(child);
    if (found) return found;
  }
}

for (const [name, file, prefix] of [
  ['split', 'src/views/home/split-results.tsx', 'split'],
  ['CDN', 'src/views/cdn/index.tsx', 'cdn-node-v3'],
  ['DNS', 'src/views/dns-exit/index.tsx', 'dns-exit'],
]) {
  test(`${name} tab remount retains the most recent measurement round`, () => {
    const view = harness(file);
    const initial = view.render();
    const key = (render) => render.options.find((q) => q.queryKey[0] === prefix).queryKey;
    findAction(initial.tree)();
    const next = view.render();
    const refreshed = key(next);
    assert.notDeepEqual(refreshed, key(initial));
    if (name !== 'split')
      assert.deepEqual(next.references, [{ scope: name.toLowerCase(), round: 1 }]);
    view.remount();
    assert.deepEqual(key(view.render()), refreshed);
  });
}
