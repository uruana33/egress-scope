import { type ReactNode, useLayoutEffect, useRef } from 'react';

import { gsap } from 'gsap';

const MOTION_OK = '(prefers-reduced-motion: no-preference)';
const FROM = { opacity: 0.45, y: 3 };
const TO = { opacity: 1, y: 0, duration: 0.22, clearProps: 'opacity,transform' };

export function AnimatedValue({
  value,
  children,
  className,
}: {
  value: unknown;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const scope = gsap.matchMedia();
    scope.add(MOTION_OK, () => {
      gsap.fromTo(ref.current, FROM, TO);
    });
    return () => scope.revert();
  }, [value]);

  return (
    <span ref={ref} className={`animated-value ${className ?? ''}`}>
      {children}
    </span>
  );
}
