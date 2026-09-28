import { useLayoutEffect, useRef } from 'react';

import { useLocation } from 'react-router-dom';

import NProgress from 'nprogress';

import { t } from '@/i18n';

const BAR_MIN_MS = 180;

export function RouteProgress() {
  const { key } = useLocation();
  const committedKey = useRef(key);

  useLayoutEffect(() => {
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    NProgress.configure({
      showSpinner: false,
      barSelector: '[role="progressbar"]',
      trickle: !still,
      speed: still ? 0 : 200,
      template: t(
        '<div class="bar" role="progressbar" aria-label="页面切换"><div class="peg"></div></div>'
      ),
    });
    return () => {
      NProgress.done();
      NProgress.remove();
    };
  }, []);

  useLayoutEffect(() => {
    if (committedKey.current === key) return;
    committedKey.current = key;
    NProgress.start();
    const timer = window.setTimeout(() => NProgress.done(), BAR_MIN_MS);
    return () => window.clearTimeout(timer);
  }, [key]);

  return null;
}
