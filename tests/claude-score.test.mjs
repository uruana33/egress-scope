import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

import {
  SIGNALS,
  normalizePublicIp,
  parseIceCandidateAddress,
  scoreLanguages,
  scoreTimezone,
} from '../vendor/claude-environment/signals.ts';

const source = readFileSync('src/views/claude/score.ts', 'utf8').replace(
  /(['"])[^'"]*vendor\/claude-environment\/signals\1/,
  JSON.stringify(new URL('../vendor/claude-environment/signals.ts', import.meta.url).href)
);
const { summarizeSignals, detectSignal } = await import(
  `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText).toString('base64')}`
);
test('environment observations keep region matching separate from account risk', () => {
  assert.equal(
    SIGNALS.reduce((n, s) => n + s.weight, 0),
    100
  );
  assert.equal(scoreTimezone('Asia/Shanghai'), 1);
  assert.equal(scoreTimezone('Asia/Taipei'), 0);
  assert.equal(scoreLanguages(['zh-TW', 'zh', 'en']), 0);
  assert.equal(scoreLanguages(['zh-CN', 'en']), 1);
});
test('summary reports observed and incomplete checks without a risk total', () => {
  const outcomes = SIGNALS.map((_, i) => ({
    raw: `observed ${i}`,
    status: 'observed',
  }));
  assert.deepEqual(summarizeSignals(outcomes), {
    observedCount: SIGNALS.length,
    unknownCount: 0,
    unavailableCount: 0,
    pendingCount: 0,
    complete: true,
    status: 'complete',
  });
  outcomes[2] = { raw: 'unknown', status: 'unknown' };
  outcomes[3] = { raw: 'blocked', status: 'unavailable' };
  assert.deepEqual(summarizeSignals(outcomes), {
    observedCount: SIGNALS.length - 2,
    unknownCount: 1,
    unavailableCount: 1,
    pendingCount: 0,
    complete: false,
    status: 'unavailable',
  });
  outcomes[4] = undefined;
  assert.equal(summarizeSignals(outcomes).pendingCount, 1);
});
test('ICE parsing only normalizes valid public addresses', () => {
  assert.equal(normalizePublicIp('8.8.8.8'), '8.8.8.8');
  assert.equal(normalizePublicIp('999.8.8.8'), undefined);
  assert.equal(normalizePublicIp('192.168.1.8'), undefined);
  assert.deepEqual(
    parseIceCandidateAddress('candidate:1 1 UDP 2122260223 192.168.1.8 54400 typ host'),
    { raw: '192.168.1.8', ip: '192.168.1.8', scope: 'non-public' }
  );
  assert.deepEqual(
    parseIceCandidateAddress('candidate:2 1 UDP 1686052607 8.8.8.8 54400 typ srflx'),
    { raw: '8.8.8.8', ip: '8.8.8.8', scope: 'public' }
  );
});
test('detector errors remain failures rather than zero scores', async () => {
  await assert.rejects(
    detectSignal({
      ...SIGNALS[0],
      detect() {
        throw new Error('blocked');
      },
    }),
    /blocked/
  );
});
test('WebRTC observations distinguish unsupported, private and public candidates', async () => {
  const definition = SIGNALS.find((signal) => signal.id === 'webrtcLeak');
  assert.ok(definition);
  const previousWindow = globalThis.window;
  const previousPeer = globalThis.RTCPeerConnection;
  try {
    globalThis.window = {};
    const unavailable = await definition.detect();
    assert.equal(unavailable.status, 'unavailable');
    class FakePeer {
      onicecandidate;
      onicecandidateerror;
      close() {}
      createDataChannel() {}
      createOffer() {
        return Promise.resolve({});
      }
      setLocalDescription() {
        queueMicrotask(() => {
          this.onicecandidate?.({
            candidate: {
              candidate: 'candidate:1 1 UDP 2122260223 192.168.1.8 54400 typ host',
            },
          });
          this.onicecandidate?.({ candidate: null });
        });
      }
    }
    globalThis.RTCPeerConnection = FakePeer;
    globalThis.window.RTCPeerConnection = FakePeer;
    const privateResult = await definition.detect();
    assert.equal(privateResult.status, 'observed');
    assert.match(privateResult.raw, /non-public candidate observed/);
    class ErrorThenPrivatePeer extends FakePeer {
      setLocalDescription() {
        queueMicrotask(() => {
          this.onicecandidateerror?.({});
          this.onicecandidate?.({
            candidate: {
              candidate: 'candidate:1 1 UDP 2122260223 192.168.1.8 54400 typ host',
            },
          });
          this.onicecandidate?.({ candidate: null });
        });
      }
    }
    globalThis.RTCPeerConnection = ErrorThenPrivatePeer;
    globalThis.window.RTCPeerConnection = ErrorThenPrivatePeer;
    const partialResult = await definition.detect();
    assert.equal(partialResult.status, 'observed');
    assert.match(partialResult.raw, /non-public candidate observed/);
    class PublicPeer extends FakePeer {
      setLocalDescription() {
        queueMicrotask(() => {
          this.onicecandidate?.({
            candidate: {
              candidate: 'candidate:2 1 UDP 1686052607 8.8.8.8 54400 typ srflx',
            },
          });
          this.onicecandidate?.({ candidate: null });
        });
      }
    }
    globalThis.RTCPeerConnection = PublicPeer;
    globalThis.window.RTCPeerConnection = PublicPeer;
    const publicResult = await definition.detect();
    assert.equal(publicResult.status, 'observed');
    assert.match(publicResult.raw, /public candidate observed/);
  } finally {
    globalThis.window = previousWindow;
    globalThis.RTCPeerConnection = previousPeer;
  }
});
