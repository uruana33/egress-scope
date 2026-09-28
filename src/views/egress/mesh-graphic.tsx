import { type CSSProperties, useEffect, useId, useRef, useState } from 'react';

import type { MeshLink } from './mesh';

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduce(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  return reduce;
}

function pathSafeId(uid: string, key: string) {
  return `mesh-${uid}-${key.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

export function MeshGraphic({
  width,
  height,
  links,
}: {
  width: number;
  height: number;
  links: readonly MeshLink[];
}) {
  const uid = useId().replace(/:/g, '');
  const svgRef = useRef<SVGSVGElement>(null);
  const reduce = usePrefersReducedMotion();

  useEffect(() => {
    const svg = svgRef.current;
    const root = svg?.closest('[data-live]');
    if (!svg || !root) return;
    const sync = () => {
      if (root.getAttribute('data-live') === 'false') svg.pauseAnimations();
      else svg.unpauseAnimations();
    };
    const observer = new MutationObserver(sync);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['data-live'],
    });
    sync();
    return () => observer.disconnect();
  }, [width, height, reduce]);

  if (width < 2 || height < 2) return null;
  return (
    <svg
      ref={svgRef}
      className="egress-mesh-svg"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden="true">
      {links.map((link) => {
        const id = pathSafeId(uid, link.key);
        const twig = Number(link.key.split(':tail:')[1] ?? 0);
        const duration =
          link.role === 'tail'
            ? `${(1.05 + (link.laneIndex % 3) * 0.1 + twig * 0.08).toFixed(2)}s`
            : `${(1.85 + (link.laneIndex % 3) * 0.2).toFixed(2)}s`;
        const begin =
          link.role === 'tail'
            ? `${(link.laneIndex * 0.48 + 0.72 + twig * 0.2).toFixed(2)}s`
            : `${(link.laneIndex * 0.48).toFixed(2)}s`;
        const trail = `${Number.parseFloat(begin) - 0.1}s`;
        return (
          <g
            key={link.key}
            className="egress-mesh-link"
            data-role={link.role}
            data-kind={link.kind}
            style={{ '--lane': link.tone } as CSSProperties}>
            <path
              id={id}
              className={link.role === 'tail' ? 'egress-mesh-tail' : 'egress-mesh-trunk'}
              d={link.d}
              vectorEffect="nonScalingStroke"
            />
            {!reduce && link.packets > 0 ? (
              <g className="egress-mesh-comet">
                <g>
                  <circle r="9" fill="var(--lane)" opacity="0.22" />
                  <circle r="4.5" fill="var(--lane)" />
                  <animateMotion dur={duration} begin={begin} repeatCount="indefinite" rotate="0">
                    <mpath href={`#${id}`} />
                  </animateMotion>
                </g>
                <g opacity="0.4">
                  <circle r="3" fill="var(--lane)" />
                  <animateMotion dur={duration} begin={trail} repeatCount="indefinite" rotate="0">
                    <mpath href={`#${id}`} />
                  </animateMotion>
                </g>
              </g>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
