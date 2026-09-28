import { useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { useAtomValue } from 'jotai';

import { Pending, ToolCard } from '@/components/toolkit';
import { t } from '@/i18n';
import { endpoint, maskedIp } from '@/lib/network';
import { hideIpAtom } from '@/store/privacy';

interface RouteItem {
  asn: string;
  name?: string;
  count: number;
  share: number;
  tier1?: boolean;
  via?: string[];
}

interface RouteEdge {
  origin: string;
  direct: string;
  count: number;
  share: number;
}

interface SecondaryEdge {
  direct: string;
  secondary: string;
  count: number;
  share: number;
}

interface RouteTopology {
  observedPaths: number;
  queryTime?: string | number;
  origins: RouteItem[];
  direct: RouteItem[];
  secondary: RouteItem[];
  edges: RouteEdge[];
  secondaryEdges: SecondaryEdge[];
}

interface IpNetwork {
  prefix?: string;
  asns?: string[];
  ptr?: string;
  routeAvailable: boolean;
  validations?: {
    asn: string;
    status: string;
  }[];
  source?: string;
  topology?: RouteTopology;
}

const WIDTH = 980;
const NODE_H = 46;
const TOP = 30;
const BOTTOM_PAD = 56;
const COL_ORIGIN = { x: 20, w: 190 };
const COL_DIRECT = { x: 330, w: 176 };
const COL_SECONDARY = { x: 700, w: 200 };

const chartHeight = (...counts: number[]) => Math.max(260, 84 + (Math.max(1, ...counts) - 1) * 60);

function laneY(count: number, index: number, height: number) {
  if (count <= 1) return height / 2 - NODE_H / 2;
  const last = height - BOTTOM_PAD - NODE_H;
  return TOP + (index * (last - TOP)) / (count - 1);
}

const midY = (y: number) => y + NODE_H / 2;

function bend(fromX: number, fromY: number, toX: number, toY: number) {
  const mid = fromX + (toX - fromX) / 2;
  return `M ${fromX} ${fromY} C ${mid} ${fromY}, ${mid} ${toY}, ${toX} ${toY}`;
}

function clip(value: string, length: number) {
  const chars = Array.from(value);
  return chars.length > length ? `${chars.slice(0, length - 1).join('')}…` : value;
}

const asDisplay = (asn: string) => (asn.toUpperCase().startsWith('AS') ? asn : `AS${asn}`);

const pct = (value: number) =>
  Number.isFinite(value) ? `${value.toFixed(1).replace(/\.0$/, '')}%` : '—';

const strokeFor = (share: number) => 1.2 + Math.min(80, Math.max(0, share)) * 0.08;

function displayName(
  item: Pick<RouteItem, 'name' | 'asn'>,
  currentAsn?: number,
  currentAsnName?: string
) {
  const current = currentAsn == null ? undefined : String(currentAsn);
  return (
    item.name?.trim() || (item.asn === current ? currentAsnName?.trim() : undefined) || t('未知')
  );
}

function rpkiLabel(status: string) {
  switch (status.toLowerCase()) {
    case 'valid':
      return t('有效');
    case 'invalid':
      return t('无效');
    case 'notfound':
    case 'unknown':
      return t('未声明 ROA');
    default:
      return t('未知');
  }
}

function snapshotLabel(value?: string | number) {
  if (!value) return t('当前');
  const timestamp = typeof value === 'number' && value < 1_000_000_000_000 ? value * 1000 : value;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return t('当前');
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function GraphNode({
  x,
  y,
  width,
  eyebrow,
  title,
  className = '',
}: {
  x: number;
  y: number;
  width: number;
  eyebrow: string;
  title: string;
  className?: string;
}) {
  return (
    <g className={`ip-route-node ${className}`} transform={`translate(${x},${y})`}>
      <rect width={width} height={NODE_H} rx="8" />
      <text x="12" y="19" className="ip-route-node-key">
        {clip(eyebrow, 25)}
      </text>
      <text x="12" y="36" className="ip-route-node-name">
        {clip(title, width < 190 ? 24 : 28)}
      </text>
    </g>
  );
}

function ColumnLabels({ labels }: { labels: [string, string, string] }) {
  return (
    <>
      <text x={COL_ORIGIN.x} y="16" className="ip-route-column-label">
        {labels[0]}
      </text>
      <text x={COL_DIRECT.x} y="16" className="ip-route-column-label">
        {labels[1]}
      </text>
      <text x={COL_SECONDARY.x} y="16" className="ip-route-column-label">
        {labels[2]}
      </text>
    </>
  );
}

function RouteTopologyChart({
  topology,
  currentAsn,
  currentAsnName,
}: {
  topology: RouteTopology;
  currentAsn?: number;
  currentAsnName?: string;
}) {
  const { origins, direct, secondary } = topology;
  const height = chartHeight(origins.length, direct.length, secondary.length);
  const positionsOf = (items: RouteItem[]) =>
    new Map(items.map((item, index) => [item.asn, laneY(items.length, index, height)]));
  const originY = positionsOf(origins);
  const directY = positionsOf(direct);
  const secondaryY = positionsOf(secondary);
  const directByAsn = new Map(direct.map((item) => [item.asn, item]));
  const current = currentAsn == null ? undefined : String(currentAsn);

  return (
    <div className="ip-route-graph-wrap">
      <svg
        className="ip-route-graph-svg"
        viewBox={`0 0 ${WIDTH} ${height}`}
        role="img"
        aria-label={t('{0} 的 BGP 宣告关系', [
          topology.origins.map((item) => asDisplay(item.asn)).join('、'),
        ])}>
        <ColumnLabels
          labels={[t('源 AS'), t('直接上游 · 路径占比'), t('二级上游 · 蓝框 = Tier 1')]}
        />

        <g className="ip-route-graph-edges" aria-hidden="true">
          {topology.edges.map((edge) => {
            const from = originY.get(edge.origin);
            const to = directY.get(edge.direct);
            if (from == null || to == null) return null;
            const tier1 = directByAsn.get(edge.direct)?.tier1;
            return (
              <g key={`${edge.origin}-${edge.direct}`}>
                <path
                  className={`ip-route-edge${tier1 ? ' is-tier1' : ''}`}
                  d={bend(COL_ORIGIN.x + COL_ORIGIN.w, midY(from), COL_DIRECT.x, midY(to))}
                  style={{ strokeWidth: strokeFor(edge.share) }}
                />
                <text
                  className="ip-route-edge-label"
                  x={(COL_ORIGIN.x + COL_ORIGIN.w + COL_DIRECT.x) / 2}
                  y={(midY(from) + midY(to)) / 2 - 6}
                  textAnchor="middle">
                  {pct(edge.share)}
                </text>
              </g>
            );
          })}
          {topology.secondaryEdges.map((edge) => {
            const from = directY.get(edge.direct);
            const to = secondaryY.get(edge.secondary);
            if (from == null || to == null) return null;
            const tier1 = secondary.find((item) => item.asn === edge.secondary)?.tier1;
            return (
              <path
                key={`${edge.direct}-${edge.secondary}`}
                className={`ip-route-edge${tier1 ? ' is-tier1' : ''}`}
                d={bend(COL_DIRECT.x + COL_DIRECT.w, midY(from), COL_SECONDARY.x, midY(to))}
                style={{ strokeWidth: strokeFor(edge.share) }}
              />
            );
          })}
        </g>

        <g>
          {origins.map((item, index) => (
            <GraphNode
              key={item.asn}
              x={COL_ORIGIN.x}
              y={laneY(origins.length, index, height)}
              width={COL_ORIGIN.w}
              eyebrow={asDisplay(item.asn)}
              title={displayName(item, currentAsn, currentAsnName)}
              className={`is-origin${item.asn === current ? ' is-current' : ''}`}
            />
          ))}
          {direct.map((item, index) => (
            <GraphNode
              key={item.asn}
              x={COL_DIRECT.x}
              y={laneY(direct.length, index, height)}
              width={COL_DIRECT.w}
              eyebrow={asDisplay(item.asn)}
              title={displayName(item, currentAsn, currentAsnName)}
              className={`${item.tier1 ? 'is-tier1' : ''}${item.asn === current ? ' is-current' : ''}`}
            />
          ))}
          {secondary.map((item, index) => (
            <GraphNode
              key={item.asn}
              x={COL_SECONDARY.x}
              y={laneY(secondary.length, index, height)}
              width={COL_SECONDARY.w}
              eyebrow={asDisplay(item.asn)}
              title={displayName(item, currentAsn, currentAsnName)}
              className={`${item.tier1 ? 'is-tier1' : ''}${item.asn === current ? ' is-current' : ''}`}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}

function AnnouncementChart({
  ip,
  prefix,
  asns,
  currentAsn,
  currentAsnName,
}: {
  ip: string;
  prefix: string;
  asns: string[];
  currentAsn?: number;
  currentAsnName?: string;
}) {
  const hidden = useAtomValue(hideIpAtom);
  const displayIp = maskedIp(ip, hidden);
  const height = chartHeight(asns.length);
  const centerY = height / 2 - NODE_H / 2;
  const isCurrent = (asn: string) => asn === String(currentAsn);

  return (
    <div className="ip-route-graph-wrap">
      <svg
        className="ip-route-graph-svg"
        viewBox={`0 0 ${WIDTH} ${height}`}
        role="img"
        aria-label={t('{0} 的 BGP 宣告关系', [displayIp])}>
        <ColumnLabels labels={[t('查询地址'), t('BGP 前缀'), t('宣告 ASN')]} />
        <g className="ip-route-graph-edges" aria-hidden="true">
          <path
            className="ip-route-edge"
            d={bend(COL_ORIGIN.x + COL_ORIGIN.w, midY(centerY), COL_DIRECT.x, midY(centerY))}
            style={{ strokeWidth: 1.5 }}
          />
          {asns.map((asn, index) => (
            <path
              key={asn}
              className="ip-route-edge"
              d={bend(
                COL_DIRECT.x + COL_DIRECT.w,
                midY(centerY),
                COL_SECONDARY.x,
                midY(laneY(asns.length, index, height))
              )}
              style={{ strokeWidth: 1.2 }}
            />
          ))}
        </g>
        <GraphNode
          x={COL_ORIGIN.x}
          y={centerY}
          width={COL_ORIGIN.w}
          eyebrow={t('查询地址')}
          title={displayIp}
          className="is-origin"
        />
        <GraphNode
          x={COL_DIRECT.x}
          y={centerY}
          width={COL_DIRECT.w}
          eyebrow={t('BGP 前缀')}
          title={prefix}
          className="is-prefix"
        />
        {asns.map((asn, index) => (
          <GraphNode
            key={asn}
            x={COL_SECONDARY.x}
            y={laneY(asns.length, index, height)}
            width={COL_SECONDARY.w}
            eyebrow={isCurrent(asn) ? t('当前 ASN') : t('宣告 ASN')}
            title={
              isCurrent(asn) && currentAsnName
                ? `${asDisplay(asn)} · ${currentAsnName}`
                : asDisplay(asn)
            }
            className={isCurrent(asn) ? 'is-current' : ''}
          />
        ))}
      </svg>
    </div>
  );
}

function RouteList({
  topology,
  currentAsn,
  currentAsnName,
}: {
  topology: RouteTopology;
  currentAsn?: number;
  currentAsnName?: string;
}) {
  const row = (item: RouteItem, secondary = false, showShare = true) => (
    <div
      key={`${secondary ? 'secondary' : 'direct'}-${item.asn}`}
      className={`ip-route-list-row${item.tier1 ? ' is-tier1' : ''}${showShare ? '' : ' is-origin'}`}>
      <div className="ip-route-list-main">
        <strong>{asDisplay(item.asn)}</strong>
        <span>
          {displayName(item, currentAsn, currentAsnName)}
          {secondary && item.via?.length ? (
            <small>{t('经 {0}', [item.via.map(asDisplay).join(' / ')])}</small>
          ) : null}
        </span>
      </div>
      {showShare && (
        <>
          <em>{pct(item.share)}</em>
          <i style={{ width: `${Math.min(100, Math.max(0, item.share))}%` }} />
        </>
      )}
    </div>
  );

  return (
    <div className="ip-route-graph-list" aria-label={t('路由路径明细')}>
      <div className="ip-route-list-heading">{t('源 AS')}</div>
      {topology.origins.map((item) => row(item, false, false))}
      <div className="ip-route-list-heading">{t('直接上游 · 路径占比')}</div>
      {topology.direct.map((item) => row(item))}
      {!!topology.secondary.length && (
        <>
          <div className="ip-route-list-heading">{t('二级上游 · 蓝色 = Tier 1')}</div>
          {topology.secondary.map((item) => row(item, true))}
        </>
      )}
    </div>
  );
}

function ValidationBadges({ items }: { items: { asn: string; status: string }[] }) {
  if (!items.length) return null;
  return (
    <div className="ip-route-graph-validations">
      {items.map((validation) => (
        <span key={validation.asn}>
          AS{validation.asn} · {rpkiLabel(validation.status)}
        </span>
      ))}
    </div>
  );
}

export default function IpRouteGraph({
  ip,
  currentAsn,
  currentAsnName,
}: {
  ip: string;
  currentAsn?: number;
  currentAsnName?: string;
}) {
  const [expanded, setExpanded] = useState(true);
  const network = useQuery({
    queryKey: ['ip-network', ip],
    queryFn: ({ signal }) =>
      endpoint<IpNetwork>(`/ip/network/${encodeURIComponent(ip)}`, { signal }),
    staleTime: 300_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const data = network.data;
  const asns = [...new Set((data?.asns ?? []).map(String).filter((asn) => asn.length > 0))];
  const topology = data?.topology;

  const title = (
    <div className="ip-route-graph-heading">
      <span className="ip-route-graph-heading-title">{t('BGP 路由拓扑')}</span>
      <button
        type="button"
        className="ip-route-graph-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}>
        {expanded ? t('收起') : t('展开')}
      </button>
      {topology && (
        <span className="ip-route-graph-heading-sub">
          {data?.prefix} · {topology.observedPaths.toLocaleString()} {t('条观测路径')}
        </span>
      )}
    </div>
  );

  const body = () => {
    if (network.isPending) {
      return (
        <div className="ip-route-graph-state">
          <Pending>{t('正在读取路由数据…')}</Pending>
        </div>
      );
    }
    if (network.isError || !data?.routeAvailable || !data.prefix) {
      return <p className="ip-route-graph-state text-muted-foreground">{t('路由数据暂不可用')}</p>;
    }
    if (topology) {
      return (
        <>
          <div className="ip-route-graph-snapshots">
            <button type="button" className="ip-route-graph-snapshot" aria-current="true" disabled>
              <span>{snapshotLabel(topology.queryTime)}</span>
              <small>{t('当前 · {0} 上游', [topology.direct.length])}</small>
            </button>
          </div>
          <RouteTopologyChart
            topology={topology}
            currentAsn={currentAsn}
            currentAsnName={currentAsnName}
          />
          <RouteList topology={topology} currentAsn={currentAsn} currentAsnName={currentAsnName} />
          <ValidationBadges items={data.validations ?? []} />
          <p className="ip-route-graph-note">
            {t('当前快照来自 RIPE RIS；连线粗细 = 观测路径占比，蓝色 = Tier 1 骨干。')}
          </p>
        </>
      );
    }
    return (
      <>
        <div className="ip-route-graph-summary">
          <div className="min-w-0">
            <strong className="block truncate">{data.prefix}</strong>
            <span>
              {data.source ?? 'RIPE RIS / RIPEstat'}
              {data.ptr ? ` · PTR ${data.ptr}` : ''}
            </span>
          </div>
          <span className="shrink-0">
            {asns.length} {t('个宣告 ASN')}
          </span>
        </div>
        <AnnouncementChart
          ip={ip}
          prefix={data.prefix}
          asns={asns}
          currentAsn={currentAsn}
          currentAsnName={currentAsnName}
        />
        <ValidationBadges items={data.validations ?? []} />
        <p className="ip-route-graph-note">
          {t(
            '当前数据源只返回 BGP 前缀和宣告 ASN，不包含完整 AS Path；图中展示宣告关系，不代表端到端上下游路径。'
          )}
        </p>
      </>
    );
  };

  return <ToolCard title={title}>{expanded && body()}</ToolCard>;
}
