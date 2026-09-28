import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  selectDefaultExitDisplaySource,
  summarizeDefaultExit,
} from '../src/views/ai/default-exit.ts';

const source = (id, transport, ip) => ({
  id,
  label: id,
  transport,
  ip,
});

test('default AI egress display prefers HTTP evidence over WebRTC', () => {
  const ipsb = source('ipsb', 'http', '74.120.253.118');
  const webrtc = source('webrtc', 'udp', '203.0.113.10');

  assert.equal(selectDefaultExitDisplaySource([webrtc, ipsb]), ipsb);

  const result = summarizeDefaultExit([ipsb, webrtc]);
  assert.equal(result.verdict, 'split');
  assert.equal(result.ip, '74.120.253.118');
  assert.equal(result.displaySource, ipsb);
});

test('default AI egress display labels WebRTC-only evidence as UDP observed', () => {
  const ipsb = source('ipsb', 'http');
  const worker = source('worker', 'http');
  const webrtc = source('webrtc', 'udp', '198.51.100.20');

  const result = summarizeDefaultExit([ipsb, worker, webrtc]);

  assert.equal(result.verdict, 'partial');
  assert.equal(result.ip, '198.51.100.20');
  assert.equal(result.displaySource, webrtc);
  assert.equal(result.displaySource.transport, 'udp');
});

test('default AI egress display marks matching independent sources verified', () => {
  const result = summarizeDefaultExit([
    source('ipsb', 'http', '1.1.1.1'),
    source('worker', 'http', '1.1.1.1'),
  ]);

  assert.equal(result.verdict, 'verified');
  assert.equal(result.ip, '1.1.1.1');
  assert.equal(result.displaySource.id, 'ipsb');
});

test('matching UDP and HTTP observations do not verify an HTTP route', () => {
  const result = summarizeDefaultExit([
    source('ipsb', 'http', '1.1.1.1'),
    source('webrtc', 'udp', '1.1.1.1'),
  ]);
  assert.equal(result.verdict, 'partial');
  assert.equal(result.displaySource.id, 'ipsb');
});

test('domestic HTTP observation exposes a distinct route', () => {
  const result = summarizeDefaultExit([
    source('ipsb', 'http', '74.120.253.118'),
    source('domestic', 'http', '140.210.32.232'),
  ]);
  assert.equal(result.verdict, 'split');
  assert.equal(result.displaySource.id, 'ipsb');
  assert.equal(result.sources[1].ip, '140.210.32.232');
});
