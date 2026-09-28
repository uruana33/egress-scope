import { type RefObject, useEffect } from 'react';

export function useActiveTabScroll(navRef: RefObject<HTMLElement | null>, pathname: string) {
  useEffect(() => {
    window.scrollTo(0, 0);
    const viewport = navRef.current?.querySelector<HTMLElement>('[data-slot=scroll-area-viewport]');
    const trigger = navRef.current?.querySelector<HTMLElement>('[role=tab][data-state=active]');
    if (!viewport || !trigger) return;
    const parent = viewport.getBoundingClientRect();
    const child = trigger.getBoundingClientRect();
    const overflowLeft = child.left - parent.left - 8;
    const overflowRight = child.right - parent.right + 8;
    const offset =
      child.left < parent.left ? overflowLeft : child.right > parent.right ? overflowRight : 0;
    if (!offset) return;
    viewport.scrollBy({
      left: offset,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
  }, [navRef, pathname]);
}
