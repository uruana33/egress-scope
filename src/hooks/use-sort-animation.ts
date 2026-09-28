import { useEffect, useLayoutEffect, useRef } from 'react';

import { gsap } from 'gsap';

const SELECTOR = '[data-sort-id]';
const REDUCED = '(prefers-reduced-motion: reduce)';

type Point = { x: number; y: number };

export function useSortAnimation(order: string) {
  const ref = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<string, Point>());

  useLayoutEffect(() => {
    const elements = ref.current?.querySelectorAll<HTMLElement>(SELECTOR);
    if (!elements) return;

    const reduced = window.matchMedia(REDUCED).matches;
    const next = new Map<string, Point>();

    elements.forEach((element) => {
      const id = element.dataset.sortId!;
      const position: Point = { x: element.offsetLeft, y: element.offsetTop };
      const previous = positions.current.get(id);
      const deltaX = previous
        ? previous.x - position.x + Number(gsap.getProperty(element, 'x'))
        : 0;
      const deltaY = previous
        ? previous.y - position.y + Number(gsap.getProperty(element, 'y'))
        : 0;

      gsap.killTweensOf(element);
      if (!reduced && (deltaX || deltaY)) {
        gsap.fromTo(
          element,
          { x: deltaX, y: deltaY },
          {
            x: 0,
            y: 0,
            duration: 0.4,
            ease: 'power2.inOut',
            overwrite: true,
            clearProps: 'transform',
          }
        );
      } else {
        gsap.set(element, { clearProps: 'transform' });
      }
      next.set(id, position);
    });
    positions.current = next;
  }, [order]);

  useEffect(() => {
    const container = ref.current;
    return () => {
      if (container) gsap.killTweensOf(container.querySelectorAll(SELECTOR));
    };
  }, []);

  return ref;
}
