import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from 'react';

import { useAtomValue } from 'jotai';

import { CountryFlag } from '@/components/country-flag';
import { SiteLogo } from '@/components/site-logo';
import { IpText } from '@/components/toolkit';
import { useIsMobile } from '@/hooks/use-mobile';
import { t } from '@/i18n';
import { maskedIp } from '@/lib/network';
import type { Geo } from '@/lib/types';
import { hideIpAtom } from '@/store/privacy';

import type { EgressLaneKind } from './lanes';
import { type MeshLaneInput, type MeshLink, type MeshPoint, buildMeshLinks } from './mesh';
import { MeshGraphic } from './mesh-graphic';
import { FlowOrigin } from './stage';

export type MeshLaneView = {
  key: string;
  kind: EgressLaneKind;
  ip?: string;
  selectKey?: string;
  logo?: string;
  geo?: Geo;
  family?: string;
  tone: string;
  title: ReactNode;
  meta: string;
  count?: ReactNode;
  titleMode?: 'ip' | 'text';
  groups: {
    key: string;
    label: string;
    sites: {
      id: string;
      name: string;
      icon?: string;
      website?: string;
      kind?: 'ip' | 'site' | 'text';
    }[];
  }[];
  packets: 0 | 1 | 2;
};

function relativePoint(
  node: HTMLElement,
  stage: DOMRect,
  xEdge: 'left' | 'center' | 'right',
  yEdge: 'top' | 'center' | 'bottom' = 'center'
): MeshPoint {
  const box = node.getBoundingClientRect();
  const x = xEdge === 'left' ? box.left : xEdge === 'right' ? box.right : box.left + box.width / 2;
  const y = yEdge === 'top' ? box.top : yEdge === 'bottom' ? box.bottom : box.top + box.height / 2;
  return { x: x - stage.left, y: y - stage.top };
}

function useMeshLinks(lanes: readonly MeshLaneView[]) {
  const stageRef = useRef<HTMLDivElement>(null);
  const originRef = useRef<HTMLSpanElement>(null);
  const exitRefs = useRef(new Map<string, HTMLElement>());
  const groupRefs = useRef(new Map<string, HTMLElement>());
  const lanesRef = useRef(lanes);
  const [frame, setFrame] = useState<{
    width: number;
    height: number;
    links: MeshLink[];
  }>({ width: 0, height: 0, links: [] });
  const signature = lanes
    .map(
      (lane) =>
        `${lane.key}:${lane.groups.map((group) => `${group.key}${group.sites.length}`).join(',')}`
    )
    .join('|');

  useLayoutEffect(() => {
    lanesRef.current = lanes;
  });

  const bindExit = (key: string) => (node: HTMLButtonElement | null) => {
    if (node) exitRefs.current.set(key, node);
    else exitRefs.current.delete(key);
  };
  const bindGroup = (key: string) => (node: HTMLDivElement | null) => {
    if (node) groupRefs.current.set(key, node);
    else groupRefs.current.delete(key);
  };

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const measure = () => {
      const box = stage.getBoundingClientRect();
      const originNode = originRef.current;
      if (!originNode || box.width < 2 || box.height < 2) return;
      const origin = relativePoint(originNode, box, 'center', 'bottom');
      const measured: MeshLaneInput[] = [];
      for (const [index, lane] of lanesRef.current.entries()) {
        const exitNode = exitRefs.current.get(lane.key);
        if (!exitNode) continue;
        const leaves = lane.groups.flatMap((group) => {
          const groupNode = groupRefs.current.get(`${lane.key}:${group.key}`);
          return groupNode ? [relativePoint(groupNode, box, 'center', 'top')] : [];
        });
        measured.push({
          key: lane.key,
          kind: lane.kind,
          tone: lane.tone,
          packets: lane.packets,
          laneIndex: index,
          entry: relativePoint(exitNode, box, 'center', 'top'),
          dock: relativePoint(exitNode, box, 'center', 'bottom'),
          leaves,
        });
      }
      setFrame({
        width: box.width,
        height: box.height,
        links: buildMeshLinks({ origin, lanes: measured }),
      });
    };

    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    if (originRef.current) observer.observe(originRef.current);
    exitRefs.current.forEach((node) => observer.observe(node));
    groupRefs.current.forEach((node) => observer.observe(node));
    measure();
    return () => observer.disconnect();
  }, [signature]);

  return { stageRef, originRef, bindExit, bindGroup, frame };
}

function SiteNode({
  label,
  icon,
  website,
  kind,
  onClick,
  more,
}: {
  label: string;
  icon?: string;
  website?: string;
  kind?: 'ip' | 'site' | 'text';
  onClick?: () => void;
  more?: boolean;
}) {
  const hidden = useAtomValue(hideIpAtom);
  const className = more
    ? 'egress-mesh-node egress-mesh-node-more'
    : kind === 'ip' || kind === 'text'
      ? 'egress-mesh-node egress-mesh-node-ip'
      : 'egress-mesh-node';
  const mark = more ? (
    <span>{label}</span>
  ) : kind === 'ip' ? (
    <span className="egress-mesh-node-ip-text">{maskedIp(label, hidden)}</span>
  ) : kind === 'text' ? (
    <span className="egress-mesh-node-ip-text">{label}</span>
  ) : (
    <SiteLogo src={icon} website={website} className="size-3.5" />
  );
  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        title={label}
        aria-label={label}
        onClick={onClick}>
        {mark}
      </button>
    );
  }
  return (
    <span className={className} title={label} aria-label={label}>
      {mark}
    </span>
  );
}

export function EgressMesh({
  lanes,
  empty,
  onSelectIp,
  onSelectSite,
  originLabel = t('本机'),
  originHint = t('浏览器发出请求'),
  layout = 'grid',
}: {
  lanes: readonly MeshLaneView[];
  empty: ReactNode;
  onSelectIp: (ip: string) => void;
  onSelectSite: (id: string) => void;
  originLabel?: ReactNode;
  originHint?: string;
  layout?: 'grid' | 'wrap';
}) {
  const { stageRef, originRef, bindExit, bindGroup, frame } = useMeshLinks(lanes);
  const mobile = useIsMobile();
  const columns = mobile
    ? '1fr'
    : lanes
        .map((lane) => {
          const weight = lane.groups.length > 4 ? 2 : 1;
          return `minmax(15.5rem, ${weight}fr)`;
        })
        .join(' ');
  return (
    <div ref={stageRef} className="egress-mesh-stage" data-tree="vertical">
      <MeshGraphic width={frame.width} height={frame.height} links={frame.links} />
      <FlowOrigin anchorRef={originRef} label={originLabel} hint={originHint} />
      {lanes.length ? (
        <div
          className="egress-mesh-bands"
          data-layout={layout}
          style={
            layout === 'wrap' || mobile
              ? undefined
              : {
                  gridTemplateColumns: columns,
                }
          }>
          {lanes.map((lane, index) => (
            <div
              key={lane.key}
              className="egress-mesh-band"
              data-kind={lane.kind}
              data-family={lane.family}
              style={
                {
                  '--lane': lane.tone,
                  '--lane-i': index,
                } as CSSProperties
              }>
              <button
                ref={bindExit(lane.key)}
                type="button"
                className="egress-flow-exit"
                onClick={() => {
                  const key = lane.selectKey ?? lane.ip;
                  if (key) onSelectIp(key);
                }}
                disabled={!(lane.selectKey ?? lane.ip)}>
                <span className="egress-flow-exit-head">
                  {lane.logo ? (
                    <SiteLogo website={lane.logo} className="size-4 rounded-sm" />
                  ) : lane.kind === 'exit' && lane.geo?.country_code ? (
                    <CountryFlag code={lane.geo.country_code} />
                  ) : null}
                  <span className="egress-flow-exit-ip">
                    {lane.titleMode === 'text' || !(lane.kind === 'exit' && lane.ip) ? (
                      lane.title
                    ) : (
                      <IpText ip={lane.ip} link={false} />
                    )}
                  </span>
                  <span className="egress-flow-exit-count">
                    {lane.count ?? (
                      <>
                        {lane.groups.reduce((total, group) => total + group.sites.length, 0)}{' '}
                        {t('站')}
                      </>
                    )}
                  </span>
                </span>
                <span className="egress-flow-exit-meta">{lane.meta}</span>
              </button>
              <div className="egress-mesh-cluster">
                {lane.groups.map((group) => (
                  <div
                    key={group.key}
                    ref={bindGroup(`${lane.key}:${group.key}`)}
                    className="egress-mesh-group"
                    data-group={group.key}>
                    <span className="egress-mesh-group-label">{group.label}</span>
                    <div className="egress-mesh-group-sites">
                      {group.sites.map((site) => (
                        <SiteNode
                          key={site.id}
                          label={site.name.replace(/^www\./, '')}
                          icon={site.icon}
                          website={site.website}
                          kind={site.kind}
                          onClick={() => onSelectSite(site.id)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        empty
      )}
    </div>
  );
}
