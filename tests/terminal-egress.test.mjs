import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  TerminalPasteError,
  parseTerminalPaste,
  sameIp,
  terminalEgressCommand,
} from '../src/views/ip/model/terminal-egress.ts';

const now = new Date('2026-09-17T11:00:00.000Z');

test('plain ipify text output is a terminal egress reading', () => {
  const reading = parseTerminalPaste(' 8.8.8.8 \n', now);
  assert.equal(reading.ip, '8.8.8.8');
  assert.equal(reading.source, 'text');
  assert.equal(reading.distinctIps, 1);
  assert.equal(reading.capturedAt, now.toISOString());
});

test('ipinfo JSON keeps the ip field and does not treat extra keys as a report', () => {
  const reading = parseTerminalPaste(
    JSON.stringify({
      ip: '1.1.1.1',
      hostname: 'one.one.one.one',
      city: 'Los Angeles',
      org: 'AS13335 Cloudflare, Inc.',
      loc: '34.0522,-118.2437',
    }),
    now
  );
  assert.equal(reading.ip, '1.1.1.1');
  assert.equal(reading.source, 'ipinfo');
});

test('a versioned terminal report uses the majority public caller-egress IP', () => {
  const reading = parseTerminalPaste(
    JSON.stringify({
      schemaVersion: 1,
      registryVersion: 'terminal-v1',
      runId: 'run-1',
      startedAt: '2026-09-17T10:59:00Z',
      finishedAt: '2026-09-17T11:00:00Z',
      results: [
        {
          schemaVersion: 1,
          runId: 'run-1',
          sourceId: 'ipify-v4',
          runtime: 'terminal',
          ip: '8.8.8.8',
          status: 'ok',
        },
        {
          schemaVersion: 1,
          runId: 'run-1',
          sourceId: 'ip.sb',
          runtime: 'terminal',
          ip: '8.8.8.8',
          status: 'ok',
        },
        {
          schemaVersion: 1,
          runId: 'run-1',
          sourceId: 'ident.me',
          runtime: 'terminal',
          ip: '1.1.1.1',
          status: 'ok',
        },
      ],
    }),
    now
  );
  assert.equal(reading.ip, '8.8.8.8');
  assert.equal(reading.source, 'report');
  assert.equal(reading.distinctIps, 2);
});

test('loopback and documentation ranges are not accepted as terminal egress', () => {
  assert.throws(() => parseTerminalPaste('127.0.0.1', now), TerminalPasteError);
  assert.throws(() => parseTerminalPaste('192.168.1.1', now), TerminalPasteError);
  assert.throws(() => parseTerminalPaste('   ', now), /没有公网 IP/);
});

test('sameIp treats IPv4-mapped IPv6 as the v4 address', () => {
  assert.equal(sameIp('8.8.8.8', '::ffff:8.8.8.8'), true);
  assert.equal(sameIp('8.8.8.8', '1.1.1.1'), false);
});

test('terminal command uses the same ipify family as the browser probe', () => {
  assert.equal(terminalEgressCommand('8.8.8.8'), 'curl -4 -fsS https://api4.ipify.org');
  assert.equal(
    terminalEgressCommand('2001:4860:4860::8888'),
    'curl -6 -fsS https://api6.ipify.org'
  );
});
