import { useSyncExternalStore } from 'react';

const BREAKPOINT = '(max-width: 767px)';

function subscribe(callback: () => void) {
  const media = window.matchMedia(BREAKPOINT);
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}

const snapshot = () => window.matchMedia(BREAKPOINT).matches;
const serverSnapshot = () => false;

export function useIsMobile() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
