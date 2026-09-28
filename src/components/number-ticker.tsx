import { useLayoutEffect, useRef } from 'react';

import { gsap } from 'gsap';

const REDUCED = '(prefers-reduced-motion: reduce)';
const FULL = '(prefers-reduced-motion: no-preference)';

const toInt = (value: number) => value.toFixed(0);

export function NumberTicker({
  value,
  formatValue = toInt,
  duration = 0.28,
  snap = 0.1,
  className,
}: {
  value: number;
  formatValue?: (value: number) => string;
  duration?: number;
  snap?: number;
  className?: string;
}) {
  const nodeRef = useRef<HTMLSpanElement>(null);
  const shown = useRef({ value: Number.isFinite(value) ? value : 0 });

  useLayoutEffect(() => {
    const node = nodeRef.current;
    if (!node) return;

    const target = Number.isFinite(value) ? value : 0;
    const scope = gsap.matchMedia();
    scope.add({ reduced: REDUCED, normal: FULL }, ({ conditions }) => {
      const paint = () => {
        node.textContent = formatValue(shown.current.value);
      };
      if (conditions?.reduced) {
        shown.current.value = target;
        paint();
        return;
      }
      paint();
      const tween = gsap.to(shown.current, {
        value: target,
        duration,
        ease: 'power2.out',
        snap: { value: snap },
        onUpdate: paint,
        onComplete: () => {
          shown.current.value = target;
          paint();
        },
      });
      return () => tween.kill();
    });
    return () => {
      const displayed = shown.current.value;
      scope.revert();
      shown.current.value = displayed;
    };
  }, [value, formatValue, duration, snap]);

  return (
    <span ref={nodeRef} className={className}>
      {formatValue(Number.isFinite(value) ? value : 0)}
    </span>
  );
}
