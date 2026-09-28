import assert from 'node:assert/strict';
import { test } from 'node:test';

import { probeAiDomain, probeCoverage } from '../src/views/ai/probe.ts';

test('Claude and Perplexity read and validate same-domain trace responses', async () => {
  const original = globalThis.fetch;
  try {
    for (const domain of ['claude.ai', 'www.perplexity.ai']) {
      globalThis.fetch = async (url, options) => {
        assert.equal(url, `https://${domain}/cdn-cgi/trace`);
        assert.equal(options.mode, 'cors');
        return new Response('ip=1.1.1.1\ncolo=SIN\nloc=SG');
      };
      const result = await probeAiDomain(domain);
      assert.equal(result.status, 'response');
      assert.equal(result.samples.length, 1);
      assert.equal(result.failures, 0);
      assert.ok(result.median >= 0);
    }
    globalThis.fetch = async () => new Response('<html>challenge</html>');
    assert.equal((await probeAiDomain('claude.ai')).status, 'restricted');
    globalThis.fetch = async () => new Response('blocked', { status: 403 });
    assert.equal((await probeAiDomain('claude.ai')).status, 'restricted');
  } finally {
    globalThis.fetch = original;
  }
});
test('Gemini probes its cross-origin robots resource instead of the missing icon', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://gemini.google.com/robots.txt');
    assert.equal(options.mode, 'no-cors');
    return new Response('');
  };
  try {
    assert.equal((await probeAiDomain('gemini.google.com')).status, 'response');
  } finally {
    globalThis.fetch = original;
  }
});
test('failed probes are skipped without retries and cancellation is preserved', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    if (++calls === 1) throw new TypeError('network');
    return new Response('ip=1.1.1.1\ncolo=SIN');
  };
  try {
    assert.equal((await probeAiDomain('www.perplexity.ai')).status, 'unknown');
    assert.equal(calls, 1);
    globalThis.fetch = async () => {
      throw new TypeError('blocked');
    };
    const result = await probeAiDomain('www.perplexity.ai');
    assert.equal(result.status, 'unknown');
    assert.equal(result.samples.length, 1);
    assert.equal(result.failures, 1);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(probeAiDomain('gemini.google.com', controller.signal), {
      name: 'AbortError',
    });
  } finally {
    globalThis.fetch = original;
  }
});

test('detail probes support a bounded number of samples and summarize successful attempts', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://claude.ai/cdn-cgi/trace');
    assert.equal(options.mode, 'cors');
    calls++;
    if (calls === 2) throw new TypeError('temporary network failure');
    return new Response('ip=1.1.1.1\ncolo=SIN\nloc=SG');
  };
  try {
    const result = await probeAiDomain('claude.ai', undefined, { sampleCount: 3 });
    assert.equal(calls, 3);
    assert.equal(result.samples.length, 3);
    assert.equal(result.failures, 1);
    assert.equal(result.samples.filter((sample) => sample < 0).length, 1);
    assert.ok(result.median >= 0);
    assert.equal(result.status, 'response');
    assert.deepEqual(probeCoverage(result), { successful: 2, total: 3, partial: true });
  } finally {
    globalThis.fetch = original;
  }
});

test('probe coverage keeps partial responses distinguishable from a complete sample', () => {
  assert.deepEqual(probeCoverage({ samples: [42, -1, 55], failures: 1 }), {
    successful: 2,
    total: 3,
    partial: true,
  });
  assert.deepEqual(probeCoverage({ samples: [42, 55], failures: 0 }), {
    successful: 2,
    total: 2,
    partial: false,
  });
});

test('restricted status is retained when every readable sample is denied', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response('blocked', { status: 429 });
  };
  try {
    const result = await probeAiDomain('www.perplexity.ai', undefined, {
      sampleCount: 3,
    });
    assert.equal(calls, 3);
    assert.deepEqual(result.samples, [-1, -1, -1]);
    assert.equal(result.failures, 3);
    assert.equal(result.median, null);
    assert.equal(result.status, 'restricted');
  } finally {
    globalThis.fetch = original;
  }
});
