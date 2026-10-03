import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  formatProbeMs,
  methodLabel,
  probeParts,
  probeTarget,
  siteChip,
  siteDisplayName,
  siteReason,
  siteSubtitle,
  siteTone,
} from '../src/views/egress/sheet.ts';

const cf = {
  id: 'cf',
  name: 'www.challenges.cloudflare.com',
  icon: 'https://example.test/cf.ico',
  method: 'cftrace',
  domain: 'challenges.cloudflare.com',
  sourceUrl: 'https://challenges.cloudflare.com',
  pending: false,
  geoPending: false,
};

test('site sheet names drop a leading www and point cftrace at /cdn-cgi/trace', () => {
  assert.equal(siteDisplayName(cf.name), 'challenges.cloudflare.com');
  assert.equal(probeTarget(cf), 'https://challenges.cloudflare.com/cdn-cgi/trace');
  assert.equal(
    probeParts('https://challenges.cloudflare.com/cdn-cgi/trace').path,
    '/cdn-cgi/trace'
  );
  assert.equal(probeParts('https://api.ipify.org?format=json').path, '?format=json');
  assert.equal(
    probeTarget({
      method: 'ip-json',
      url: 'https://api.ipify.org?format=json',
      sourceUrl: 'https://api.ipify.org?format=json',
    }),
    'https://api.ipify.org?format=json'
  );
  assert.equal(
    methodLabel({ method: 'headers', responseHeader: 'cdn-user-ip' }),
    '响应头 · cdn-user-ip'
  );
});

test('probe duration stays compact and status copy does not repeat success', () => {
  assert.equal(formatProbeMs(940), '940 ms');
  assert.equal(formatProbeMs(1200), '1.2 s');
  assert.equal(formatProbeMs(undefined), undefined);
  const ok = {
    ...cf,
    geo: { ip: '208.67.222.222', country: 'United States' },
    diagnostic: {
      status: 'ok',
      networkMs: 940,
    },
  };
  assert.equal(siteTone(ok), 'ok');
  assert.equal(siteChip(ok), '已读取');
  assert.equal(siteSubtitle(ok), 'Cloudflare Trace · 940 ms');
  assert.equal(siteReason(ok), undefined);
});

test('blocked probes surface timeout and CORS instead of a generic footer', () => {
  const timeout = {
    ...cf,
    diagnostic: { status: 'timeout', errorCode: 'timeout', networkMs: 8000 },
  };
  assert.equal(siteTone(timeout), 'blocked');
  assert.equal(siteChip(timeout), '超时');
  assert.match(siteReason(timeout), /检测超时/);
  const cors = {
    ...cf,
    diagnostic: { status: 'network_error', errorCode: 'cors' },
  };
  assert.equal(siteChip(cors), '受阻');
  assert.equal(siteReason(cors), '接口不可读或跨域受限');
});
