export const PRELOAD_RELOAD_PARAM = 'app-reload';

type PreloadWindow = Pick<Window, 'addEventListener' | 'removeEventListener' | 'location'>;

export function preloadRecoveryUrl(href: string, build: string) {
  const url = new URL(href);
  if (url.searchParams.get(PRELOAD_RELOAD_PARAM) === build) return null;
  url.searchParams.set(PRELOAD_RELOAD_PARAM, build);
  return url.href;
}

export function installPreloadRecovery(target: PreloadWindow, build: string) {
  const onPreloadError = (event: Event) => {
    const next = preloadRecoveryUrl(target.location.href, build);
    if (!next) return;
    event.preventDefault();
    target.location.replace(next);
  };

  target.addEventListener('vite:preloadError', onPreloadError);
  return () => target.removeEventListener('vite:preloadError', onPreloadError);
}
