import assert from 'node:assert/strict';
import { test } from 'node:test';

import { installPreloadRecovery, preloadRecoveryUrl } from '../src/lib/preload-recovery.ts';

test('preload recovery reloads once per running build', () => {
  assert.equal(
    preloadRecoveryUrl('https://example.com/network/ip', 'build-a'),
    'https://example.com/network/ip?app-reload=build-a'
  );
  assert.equal(
    preloadRecoveryUrl('https://example.com/network/ip?app-reload=build-a', 'build-a'),
    null
  );
  assert.equal(
    preloadRecoveryUrl('https://example.com/network/ip?app-reload=build-a', 'build-b'),
    'https://example.com/network/ip?app-reload=build-b'
  );
});

test('vite preload errors are suppressed only when recovery can reload', () => {
  let listener;
  let replaced = '';
  const target = {
    addEventListener: (_type, next) => {
      listener = next;
    },
    removeEventListener: () => {},
    location: {
      href: 'https://example.com/network/ip',
      replace: (url) => {
        replaced = url;
      },
    },
  };
  installPreloadRecovery(target, 'build-a');
  const event = new Event('vite:preloadError', { cancelable: true });
  listener(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(replaced, 'https://example.com/network/ip?app-reload=build-a');

  target.location.href = replaced;
  replaced = '';
  const repeated = new Event('vite:preloadError', { cancelable: true });
  listener(repeated);
  assert.equal(repeated.defaultPrevented, false);
  assert.equal(replaced, '');
});
