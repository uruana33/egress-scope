import { useLayoutEffect, useRef, useState } from 'react';

import { DetailText } from './detail-text';

export function OverflowDetailText({ text, title }: { text: string; title?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const check = () => setOverflows(element.scrollWidth > element.clientWidth);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text]);

  return (
    <div className="relative min-w-0">
      <span ref={ref} className={`block truncate ${overflows ? 'invisible' : ''}`}>
        {text}
      </span>
      {overflows ? (
        <div className="absolute inset-0">
          <DetailText text={text} title={title} />
        </div>
      ) : null}
    </div>
  );
}
