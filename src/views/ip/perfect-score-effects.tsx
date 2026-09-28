import { useLayoutEffect, useRef } from 'react';

import { gsap } from 'gsap';

const MOTION_OK = '(prefers-reduced-motion: no-preference)';

function buildTimeline(layer: HTMLElement, card: HTMLElement) {
  const glow = layer.querySelectorAll('.ip-perfect-glow');
  const sheen = layer.querySelector('.ip-perfect-sheen');
  const sparks = layer.querySelectorAll('.ip-perfect-spark');
  const badge = card.querySelector('.ip-reputation-perfect');
  const crown = card.querySelector('.ip-perfect-label svg');

  const timeline = gsap.timeline({ defaults: { ease: 'power2.out' } });
  timeline.fromTo(layer, { opacity: 0 }, { opacity: 1, duration: 0.35, clearProps: 'opacity' }, 0);
  if (badge) {
    timeline.from(badge, { y: 8, opacity: 0, duration: 0.7, clearProps: 'transform,opacity' }, 0);
  }
  if (crown) {
    timeline.from(
      crown,
      {
        rotation: -12,
        scale: 0.8,
        duration: 0.8,
        ease: 'back.out(1.5)',
        clearProps: 'transform',
      },
      0.15
    );
  }
  timeline.fromTo(
    glow,
    { scale: 0.94, opacity: 0.3 },
    {
      scale: 1.08,
      opacity: 0.65,
      duration: 5,
      stagger: 0.5,
      repeat: 1,
      yoyo: true,
      ease: 'sine.inOut',
    },
    0
  );
  timeline
    .fromTo(sheen, { xPercent: 0, opacity: 0 }, { opacity: 0.65, duration: 0.5 }, 0.4)
    .to(sheen, { xPercent: 420, duration: 2.4, ease: 'sine.inOut' }, 0.4)
    .to(sheen, { opacity: 0, duration: 0.6 }, 2.1);
  timeline.fromTo(
    sparks,
    { scale: 0.6, opacity: 0.15 },
    {
      scale: 1.15,
      opacity: 0.7,
      duration: 1.1,
      stagger: 0.2,
      repeat: 1,
      yoyo: true,
      ease: 'sine.inOut',
    },
    0.6
  );
  return timeline;
}

export function PerfectScoreEffects() {
  const root = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const layer = root.current;
    const card = layer?.parentElement;
    if (!layer || !card) return;

    const scope = gsap.matchMedia();
    scope.add(MOTION_OK, () => {
      const timeline = buildTimeline(layer, card);
      let onScreen = true;
      const syncPlayback = () => {
        if (document.hidden || !onScreen) {
          timeline.pause();
        } else {
          timeline.resume();
        }
      };
      const observer = new IntersectionObserver(([entry]) => {
        onScreen = entry.isIntersecting;
        syncPlayback();
      });
      observer.observe(card);
      document.addEventListener('visibilitychange', syncPlayback);
      return () => {
        observer.disconnect();
        document.removeEventListener('visibilitychange', syncPlayback);
      };
    });
    return () => scope.revert();
  }, []);

  return (
    <div ref={root} className="ip-perfect-effects" aria-hidden="true">
      <span className="ip-perfect-glow ip-perfect-glow-primary" />
      <span className="ip-perfect-glow ip-perfect-glow-secondary" />
      <span className="ip-perfect-sheen" />
      <span className="ip-perfect-spark" />
      <span className="ip-perfect-spark" />
      <span className="ip-perfect-spark" />
    </div>
  );
}
