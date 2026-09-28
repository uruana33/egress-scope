import { type RefObject, useLayoutEffect } from 'react';

import { gsap } from 'gsap';

const MOTION_OK = '(prefers-reduced-motion: no-preference)';

export function useFieldReveal(ref: RefObject<HTMLDListElement | null>, seed: string) {
  useLayoutEffect(() => {
    const list = ref.current;
    if (!list) return;
    const media = gsap.matchMedia();
    media.add(MOTION_OK, () => {
      const tween = gsap.fromTo(
        list.querySelectorAll(':scope > div'),
        { opacity: 0, y: 8 },
        {
          opacity: 1,
          y: 0,
          duration: 0.35,
          stagger: 0.045,
          ease: 'power2.out',
          clearProps: 'opacity,transform',
        }
      );
      return () => tween.kill();
    });
    return () => media.revert();
  }, [ref, seed]);
}
