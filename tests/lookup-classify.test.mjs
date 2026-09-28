import assert from 'node:assert/strict';
import { test } from 'node:test';

import { LOOKUP_EXAMPLES, classifyLookup } from '../src/views/lookup/classify.ts';
import { lookupHref, lookupLocation } from '../src/views/lookup/href.ts';

test('classifies IP, domain and pasted URLs; AS numbers are not queries', () => {
  assert.deepEqual(classifyLookup(' 1.1.1.1 ').kind, 'ip');
  assert.equal(classifyLookup('1.1.1.1').value, '1.1.1.1');
  assert.equal(classifyLookup('2001:4860:4860::8888').kind, 'ip');
  assert.equal(classifyLookup('AS15169').kind, 'unknown');
  assert.equal(classifyLookup('as 15169').kind, 'unknown');
  assert.equal(classifyLookup('qq.com').kind, 'domain');
  assert.equal(classifyLookup('https://www.qq.com/news').kind, 'domain');
  assert.equal(classifyLookup('https://www.qq.com/news').value, 'www.qq.com');
  assert.equal(classifyLookup('https://www.qq.com/news').strippedUrl, true);
  assert.equal(classifyLookup('www.qq.com').subdomainHint, true);
  assert.equal(classifyLookup('qq.com').subdomainHint, false);
  assert.equal(classifyLookup('not a host').kind, 'unknown');
  assert.equal(classifyLookup('https://1.1.1.1/').kind, 'ip');
  assert.equal(classifyLookup('https://1.1.1.1/').value, '1.1.1.1');
  assert.equal(classifyLookup('999.1.1.1').kind, 'unknown');
  assert.ok(LOOKUP_EXAMPLES.includes('1.1.1.1'));
  assert.ok(LOOKUP_EXAMPLES.includes('qq.com'));
  assert.equal(LOOKUP_EXAMPLES.includes('AS15169'), false);
});

test('lookup href keeps pretty IP paths and query strings for other kinds', () => {
  assert.equal(lookupHref('1.1.1.1'), '/network/ip/1.1.1.1');
  assert.equal(lookupHref('1.1.1.1', 'ping'), '/network/ip/1.1.1.1?view=ping');
  assert.equal(lookupHref('qq.com'), '/network/ip?q=qq.com');
  assert.equal(lookupHref('AS15169'), '/network/ip?q=AS15169');
  assert.equal(lookupHref(), '/network/ip');
  assert.deepEqual(lookupLocation('https://qq.com'), {
    pathname: '/network/ip',
    search: 'q=qq.com',
  });
});
