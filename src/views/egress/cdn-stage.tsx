import { type ReactNode, useRef, useState } from 'react';

import { NumberTicker } from '@/components/number-ticker';
import { ActionButton } from '@/components/toolkit';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import { t } from '@/i18n';

import {
  type CdnForestTree,
  type CdnHit,
  type CdnLane,
  cdnLaneGroups,
  cdnLeafKind,
  cdnMemberId,
  cdnNodeLabel,
  groupCdnLanes,
  parseCdnLeafId,
  splitCdnForest,
  summarizeCdnHits,
} from './cdn-lanes';
import {
  CdnFamilyDescription,
  CdnFamilySheet,
  CdnFamilyTitle,
  CdnMemberDescription,
  CdnMemberSheet,
  CdnMemberTitle,
} from './cdn-sheet';
import type { DnsHttpExit } from './dns-lanes';
import { dnsHttpPath } from './dns-lanes';
import { EgressMesh, type MeshLaneView } from './mesh-stage';
import { FlowStage } from './stage';

const TONES = [
  'var(--success)',
  'var(--primary)',
  '#a855f7',
  'var(--warning)',
  '#0ea5e9',
  'var(--danger)',
];

function laneTone(lane: CdnLane, exitIndex: number) {
  if (lane.kind === 'blocked') return 'var(--danger)';
  if (lane.kind === 'pending') return 'var(--muted-foreground)';
  return TONES[exitIndex % TONES.length];
}

function laneTitle(lane: CdnLane) {
  if (lane.family === 'pending') return t('检测中…');
  return lane.familyLabel;
}

function laneMeta(lane: CdnLane) {
  if (lane.kind === 'pending') return t('探针还在路上');
  if (lane.kind === 'blocked') return t('头未公开');
  return lane.members.length > 1
    ? t('{0} 座节点', [lane.samples])
    : lane.members[0]?.node
      ? cdnNodeLabel(lane.members[0].node)
      : t('边缘节点');
}

function collectHttpExits(provided: readonly DnsHttpExit[] | undefined) {
  const seen = new Set<string>();
  const exits: DnsHttpExit[] = [];
  for (const geo of provided ?? []) {
    if (!geo?.ip || seen.has(geo.ip)) continue;
    seen.add(geo.ip);
    exits.push({ ...geo, path: dnsHttpPath(geo) });
  }
  exits.sort((left, right) => {
    const rank = (item: DnsHttpExit) =>
      item.path === 'domestic' || item.country_code === 'CN' ? 1 : 0;
    return rank(right) - rank(left);
  });
  return exits;
}

function SourceOriginLabel({ path }: { path: CdnForestTree['key'] }) {
  const label =
    path === 'domestic'
      ? t('国内 CDN 来源')
      : path === 'overseas'
        ? t('海外 CDN 来源')
        : t('CDN 来源');
  return (
    <span className="egress-flow-you-ip" title={t('按 CDN 预设来源分类')}>
      {label}
    </span>
  );
}

function httpReferenceHint(tree: CdnForestTree, busy: boolean) {
  const reference = tree.origin;
  if (reference?.ip) {
    return [
      t('按 CDN 预设来源分类'),
      t('HTTP 出口仅作对照'),
      reference.ip,
      reference.country,
      reference.isp,
    ]
      .filter(Boolean)
      .join(' · ');
  }
  return busy ? t('正在读取 HTTP 对照出口') : t('按 CDN 预设来源分类，HTTP 出口仅作对照');
}

function toMeshLanes(lanes: readonly CdnLane[], toneFrom = 0): MeshLaneView[] {
  return lanes.map((lane, index) => ({
    key: lane.key,
    kind: lane.kind,
    selectKey: lane.key,
    logo: lane.website || undefined,
    family: lane.family,
    tone: laneTone(lane, toneFrom + index),
    title: laneTitle(lane),
    titleMode: 'text' as const,
    meta: laneMeta(lane),
    count: (
      <>
        {lane.kind === 'pending' ? (
          t('检测中…')
        ) : (
          <>
            {lane.samples} {t('座')}
          </>
        )}
      </>
    ),
    groups: cdnLaneGroups(lane).map((group) => ({
      key: group.key,
      label: t(group.label),
      sites: group.members.map((member) => ({
        id: cdnMemberId(lane.key, group.key, member.id),
        name: group.key === 'colo' && member.node ? cdnNodeLabel(member.node) : member.name,
        website: member.website,
        kind:
          group.key === 'colo'
            ? cdnLeafKind(member.node ? cdnNodeLabel(member.node) : member.name)
            : ('site' as const),
      })),
    })),
    packets: lane.kind === 'exit' || lane.kind === 'pending' ? 1 : 0,
  }));
}

function CdnTreeMesh({
  tree,
  toneFrom,
  busy,
  onSelectLane,
  onSelectSite,
}: {
  tree: CdnForestTree;
  toneFrom: number;
  busy: boolean;
  onSelectLane: (key: string) => void;
  onSelectSite: (id: string) => void;
}) {
  return (
    <EgressMesh
      layout="wrap"
      originLabel={<SourceOriginLabel path={tree.key} />}
      originHint={httpReferenceHint(tree, busy)}
      lanes={toMeshLanes(tree.lanes, toneFrom)}
      onSelectIp={onSelectLane}
      onSelectSite={onSelectSite}
      empty={
        <p className="egress-flow-empty">
          {busy ? t('查询包正在离开本机…') : t('开始检测后，边缘节点会在这里亮起来。')}
        </p>
      }
    />
  );
}

export function CdnStage({
  hits,
  busy,
  httpExits,
  action,
}: {
  hits: readonly CdnHit[];
  busy: boolean;
  httpExits?: DnsHttpExit[];
  action?: ReactNode;
}) {
  const [detailLane, setDetailLane] = useState<string | null>(null);
  const [detailLeaf, setDetailLeaf] = useState<string | null>(null);
  const lanes = groupCdnLanes(hits);
  const originExits = collectHttpExits(httpExits);
  const trees = splitCdnForest(lanes, originExits, busy);
  const forest = trees.length > 1;
  const summary = summarizeCdnHits(hits);
  const { ready, failed } = summary;
  const done = summary.done.length;
  const families = summary.successfulFamilies;
  const bothTrees =
    forest && trees.every((tree) => tree.lanes.some((lane) => lane.kind === 'exit'));
  const selectedLane = detailLane ? lanes.find((lane) => lane.key === detailLane) : undefined;
  const parsedLeaf = detailLeaf ? parseCdnLeafId(detailLeaf) : undefined;
  const leafLane = parsedLeaf ? lanes.find((lane) => lane.key === parsedLeaf.laneKey) : undefined;
  const selectedMember = parsedLeaf
    ? leafLane?.members.find((member) => member.id === parsedLeaf.id)
    : undefined;
  const sheet = selectedMember
    ? { kind: 'member' as const, member: selectedMember }
    : selectedLane
      ? { kind: 'family' as const, lane: selectedLane }
      : null;
  const heldSheet = useRef(sheet);
  if (sheet) heldSheet.current = sheet;
  const view = sheet ?? heldSheet.current;
  const progress = hits.length ? Math.min(1, done / hits.length) : 0;
  const verdict = bothTrees
    ? t('国内和海外来源均有节点')
    : ready.length
      ? t('边缘节点已点亮')
      : busy
        ? t('正在询问 CDN')
        : t('还没有读到节点');

  return (
    <FlowStage className="egress-flow egress-cdn cyber-cockpit-card">
      <div className="egress-flow-toolbar">
        <div className="egress-flow-kicker">
          <span
            className="egress-flow-verdict"
            data-state={bothTrees ? 'split' : ready.length ? 'single' : 'wait'}>
            <span className="egress-flow-verdict-dot" />
            {verdict}
          </span>
          <p className="egress-flow-lead">
            {t(
              '国内和海外按 CDN 预设来源分组。HTTP 出口单独作为对照，节点是边缘 POP，不代表每个请求绑定该 IP。'
            )}
          </p>
        </div>
        {action ? <div className="egress-flow-actions">{action}</div> : null}
      </div>
      <div
        className="egress-dns-meter"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={hits.length}
        aria-valuenow={done}
        aria-label={t('CDN 探测进度')}>
        <span className="egress-dns-meter-fill" style={{ transform: `scaleX(${progress})` }} />
      </div>
      <ul className="egress-flow-stats">
        <li>
          <NumberTicker value={families.length} />
          <span>{t('家厂商')}</span>
        </li>
        <li>
          <NumberTicker value={ready.length} />
          <span>{t('个节点')}</span>
        </li>
        <li>
          <NumberTicker value={done} />
          <span>
            /{hits.length} {t('次探测')}
          </span>
        </li>
        <li>
          <NumberTicker value={failed.length} />
          <span>{t('次失败')}</span>
        </li>
      </ul>
      {forest ? (
        <div className="egress-cdn-forest">
          {trees.map((tree, index) => (
            <section key={tree.key} className="egress-cdn-tree" data-path={tree.key}>
              <CdnTreeMesh
                tree={tree}
                toneFrom={index * 3}
                busy={busy}
                onSelectLane={(key) => {
                  setDetailLeaf(null);
                  setDetailLane(key);
                }}
                onSelectSite={(id) => {
                  setDetailLane(null);
                  setDetailLeaf(id);
                }}
              />
            </section>
          ))}
        </div>
      ) : trees[0] ? (
        <CdnTreeMesh
          tree={trees[0]}
          toneFrom={0}
          busy={busy}
          onSelectLane={(key) => {
            setDetailLeaf(null);
            setDetailLane(key);
          }}
          onSelectSite={(id) => {
            setDetailLane(null);
            setDetailLeaf(id);
          }}
        />
      ) : null}
      <ResponsiveDialog
        className="egress-sheet-dialog"
        open={sheet !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDetailLane(null);
            setDetailLeaf(null);
          }
        }}
        title={
          view?.kind === 'member' ? (
            <CdnMemberTitle member={view.member} />
          ) : view?.kind === 'family' ? (
            <CdnFamilyTitle lane={view.lane} />
          ) : (
            t('CDN 节点')
          )
        }
        description={
          view?.kind === 'member' ? (
            <CdnMemberDescription member={view.member} />
          ) : view?.kind === 'family' ? (
            <CdnFamilyDescription lane={view.lane} />
          ) : null
        }>
        {view?.kind === 'member' ? (
          <CdnMemberSheet key={view.member.id} member={view.member} />
        ) : view?.kind === 'family' ? (
          <CdnFamilySheet
            key={view.lane.key}
            lane={view.lane}
            onSelectMember={(id) => {
              const group =
                cdnLaneGroups(view.lane).find((item) =>
                  item.members.some((member) => member.id === id)
                )?.key ?? 'colo';
              setDetailLane(null);
              setDetailLeaf(cdnMemberId(view.lane.key, group, id));
            }}
          />
        ) : null}
      </ResponsiveDialog>
    </FlowStage>
  );
}

export function CdnRetryButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <ActionButton size="sm" busy={busy} onClick={onClick}>
      {busy ? t('检测中...') : t('重新检测')}
    </ActionButton>
  );
}
