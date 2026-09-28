import { type CSSProperties, type ReactNode, type Ref, useEffect, useRef } from 'react';

import { Laptop } from 'lucide-react';

/** Pause looping packets when the stage is off-screen. */
function useLiveMotion<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        node.dataset.live = entry.isIntersecting ? 'true' : 'false';
      },
      { threshold: 0.12 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return ref;
}

export function FlowOrigin({
  label,
  hint,
  anchorRef,
}: {
  label: ReactNode;
  hint?: string;
  anchorRef?: Ref<HTMLSpanElement>;
}) {
  return (
    <div className="egress-flow-you">
      <span className="egress-flow-you-node" aria-hidden="true">
        <span className="egress-flow-you-ring" />
        <Laptop className="egress-flow-you-icon" />
      </span>
      <span className="egress-flow-you-label">{label}</span>
      {hint ? <span className="egress-flow-you-hint">{hint}</span> : null}
      {anchorRef ? (
        <span ref={anchorRef} className="egress-flow-you-pin" aria-hidden="true" />
      ) : null}
    </div>
  );
}

export function FlowWire({
  delay = 0,
  packets = 2,
  tone,
}: {
  delay?: number;
  packets?: number;
  tone?: string;
}) {
  return (
    <div
      className="egress-flow-wire"
      style={tone ? ({ '--lane': tone } as CSSProperties) : undefined}
      aria-hidden="true">
      <span className="egress-flow-wire-line" />
      {Array.from({ length: packets }, (_, index) => (
        <span
          key={index}
          className="egress-flow-carrier"
          style={{ animationDelay: `${delay + index * 0.55}s` }}>
          <span className="egress-flow-packet" />
        </span>
      ))}
    </div>
  );
}

export function FlowStage({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useLiveMotion<HTMLDivElement>();
  return (
    <div ref={ref} className={className} data-live="true">
      {children}
    </div>
  );
}
