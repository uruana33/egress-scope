import type { ReactNode } from 'react';

import { NumberTicker } from '@/components/number-ticker';
import { t } from '@/i18n';

import {
  type EgressLane,
  type EgressLaneRow,
  groupEgressLanes,
  groupLaneSites,
  summarizeEgressLanes,
} from './lanes';
import { EgressMesh } from './mesh-stage';
import { FlowStage } from './stage';

const TONES = [
  'var(--success)',
  'var(--primary)',
  '#a855f7',
  'var(--warning)',
  '#0ea5e9',
  'var(--danger)',
];

const GROUP_LABELS: Record<string, string> = {
  domestic: '国内',
  international: '海外',
  ai: 'AI',
  social: '社交',
  crypto: '加密',
  risk: '风控',
  tools: '工具',
  ecommerce: '购物',
  media: '媒体',
  static: '静态资源',
  speed: '加速',
  dev: '开发',
};

function laneTone(lane: EgressLane, exitIndex: number) {
  if (lane.kind === 'blocked') return 'var(--danger)';
  if (lane.kind === 'pending') return 'var(--muted-foreground)';
  return TONES[exitIndex % TONES.length];
}

function laneTitle(lane: EgressLane) {
  if (lane.kind === 'blocked') return t('检测受阻');
  if (lane.kind === 'pending') return t('检测中…');
  if (lane.kind === 'idle') return t('待检测');
  return lane.ip ?? t('未知');
}

function laneMeta(lane: EgressLane) {
  if (lane.kind === 'pending') return t('探针还在路上');
  if (lane.kind === 'idle') return t('点检测全部后开始走');
  if (lane.kind === 'blocked') return t('接口不可读或跨域受限');
  return (
    [lane.geo?.country, lane.geo?.city, lane.geo?.isp].filter(Boolean).join(' · ') ||
    t('归属信息暂不可用')
  );
}

function groupLabel(key: string) {
  return t(GROUP_LABELS[key] ?? key);
}

export function EgressFlowBoard({
  rows,
  total,
  pending,
  action,
  onSelectIp,
  onSelectSite,
}: {
  rows: readonly EgressLaneRow[];
  total: number;
  pending: boolean;
  action?: ReactNode;
  onSelectIp: (ip: string) => void;
  onSelectSite: (id: string) => void;
}) {
  const lanes = groupEgressLanes(rows);
  const summary = summarizeEgressLanes(lanes);
  const visible = [
    ...summary.exits,
    ...(summary.pendingCount ? lanes.filter((lane) => lane.kind === 'pending') : []),
    ...(summary.blockedCount ? lanes.filter((lane) => lane.kind === 'blocked') : []),
  ];
  const verdict =
    summary.exitCount > 1
      ? t('观察到多个出口')
      : summary.exitCount === 1
        ? t('已读站点使用同一出口')
        : pending
          ? t('正在观测出口')
          : t('还没有读到出口');

  return (
    <FlowStage className="egress-flow cyber-cockpit-card">
      <div className="egress-flow-toolbar">
        <div className="egress-flow-kicker">
          <span
            className="egress-flow-verdict"
            data-state={
              summary.exitCount > 1 ? 'split' : summary.exitCount === 1 ? 'single' : 'wait'
            }>
            <span className="egress-flow-verdict-dot" />
            {verdict}
          </span>
          <p className="egress-flow-lead">
            {t('按本轮站点回显的 IP 分组；不同地址不直接证明代理规则生效。')}
          </p>
        </div>
        {action ? <div className="egress-flow-actions">{action}</div> : null}
      </div>
      <ul className="egress-flow-stats">
        <li>
          <NumberTicker value={summary.exitCount} />
          <span>{t('条出口')}</span>
        </li>
        <li>
          <NumberTicker value={summary.readCount} />
          <span>
            /{total} {t('已读取')}
          </span>
        </li>
        <li>
          <NumberTicker value={summary.blockedCount} />
          <span>{t('受阻')}</span>
        </li>
        <li>
          <NumberTicker value={summary.pendingCount} />
          <span>{t('探测中')}</span>
        </li>
      </ul>
      <EgressMesh
        lanes={visible.map((lane, index) => ({
          key: lane.key,
          kind: lane.kind,
          ip: lane.ip,
          geo: lane.geo,
          tone: laneTone(lane, index),
          title: laneTitle(lane),
          meta: laneMeta(lane),
          groups: groupLaneSites(lane.sites).map((group) => ({
            key: group.key,
            label: groupLabel(group.key),
            sites: group.sites,
          })),
          packets: lane.kind === 'exit' || lane.kind === 'pending' ? 1 : 0,
        }))}
        onSelectIp={onSelectIp}
        onSelectSite={onSelectSite}
        empty={<p className="egress-flow-empty">{t('探针回来后这里会画出出口。')}</p>}
      />
    </FlowStage>
  );
}
