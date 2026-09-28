import { CopyButton } from '@/components/copy-button';
import { SiteLogo } from '@/components/site-logo';
import { t } from '@/i18n';

import { type CdnHit, type CdnLane, cdnNodeLabel } from './cdn-lanes';
import { probeParts } from './sheet';

export function CdnFamilyTitle({ lane }: { lane: CdnLane }) {
  return (
    <span className="egress-sheet-title">
      {lane.website ? <SiteLogo website={lane.website} className="size-7 rounded-md" /> : null}
      <span className="egress-sheet-title-text">{lane.familyLabel}</span>
    </span>
  );
}

export function CdnFamilyDescription({ lane }: { lane: CdnLane }) {
  const path = lane.path === 'domestic' ? t('国内 CDN 来源') : t('海外 CDN 来源');
  return (
    <>
      <span className="egress-sheet-sub">{path}</span>
      <span className="egress-sheet-chip" data-state={lane.kind === 'blocked' ? 'blocked' : 'ok'}>
        {lane.samples} {t('座节点')}
      </span>
    </>
  );
}

export function CdnMemberTitle({ member }: { member: CdnHit }) {
  return (
    <span className="egress-sheet-title">
      <SiteLogo website={member.website} className="size-7 rounded-md" />
      <span className="egress-sheet-title-text">{member.name}</span>
    </span>
  );
}

export function CdnMemberDescription({ member }: { member: CdnHit }) {
  const colo = member.node ? cdnNodeLabel(member.node) : undefined;
  return (
    <>
      <span className="egress-sheet-sub">
        {member.loading ? t('探测中') : colo || member.error || t('节点标识')}
      </span>
      <span
        className="egress-sheet-chip"
        data-state={member.loading ? 'pending' : member.node ? 'ok' : 'blocked'}>
        {member.loading ? t('探测中') : member.node ? t('已完成') : t('受阻')}
      </span>
    </>
  );
}

function ProbeRow({ url }: { url: string }) {
  const parsed = probeParts(url);
  return (
    <div>
      <dt>{t('探针')}</dt>
      <dd className="egress-sheet-probe">
        <span className="egress-sheet-probe-url">
          <span>{parsed.host}</span>
          {parsed.path ? <span>{parsed.path}</span> : null}
        </span>
        <CopyButton value={url} />
      </dd>
    </div>
  );
}

function MemberState({ member }: { member: CdnHit }) {
  if (member.loading) return t('探测中');
  if (member.node) return cdnNodeLabel(member.node);
  return member.error || t('接口不可读或跨域受限');
}

export function CdnFamilySheet({
  lane,
  onSelectMember,
}: {
  lane: CdnLane;
  onSelectMember: (id: string) => void;
}) {
  return (
    <div className="egress-sheet">
      {lane.website ? (
        <div className="egress-sheet-exit-actions">
          <a className="egress-sheet-link" href={lane.website} target="_blank" rel="noreferrer">
            {t('查看厂商站点')}
          </a>
        </div>
      ) : null}
      <section className="egress-sheet-section">
        <h3 className="egress-sheet-section-label">
          {t('探测源')}
          <span>
            {lane.members.length} {t('次探测')}
          </span>
        </h3>
        <ul className="egress-sheet-sites">
          {lane.members.map((member) => (
            <li key={member.id}>
              <button
                type="button"
                className="egress-sheet-site"
                onClick={() => onSelectMember(member.id)}>
                <SiteLogo website={member.website} className="size-5 rounded-md" />
                <span className="egress-sheet-site-name">{member.name}</span>
                <span className="egress-sheet-site-meta">
                  <MemberState member={member} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function CdnMemberSheet({ member }: { member: CdnHit }) {
  const colo = member.node ? cdnNodeLabel(member.node) : undefined;
  return (
    <div className="egress-sheet">
      <div className="egress-sheet-exit-actions">
        <a className="egress-sheet-link" href={member.website} target="_blank" rel="noreferrer">
          {t('查看厂商站点')}
        </a>
      </div>
      <div
        className="egress-sheet-exit"
        data-state={member.loading ? 'pending' : member.node ? 'ok' : 'blocked'}>
        {member.loading ? (
          <p className="egress-sheet-miss">{t('探针还在路上')}</p>
        ) : member.node ? (
          <>
            <div className="egress-sheet-ip">
              <span className="egress-sheet-title-text">{colo}</span>
              <CopyButton value={colo ?? member.node} />
            </div>
            <p className="egress-sheet-geo">{member.node}</p>
          </>
        ) : (
          <p className="egress-sheet-miss">{member.error || t('节点头未公开或跨域受限')}</p>
        )}
      </div>
      <dl className="egress-sheet-facts">
        <div>
          <dt>{t('CDN 厂商')}</dt>
          <dd>{member.name}</dd>
        </div>
        <div>
          <dt>{t('缓存状态')}</dt>
          <dd>{member.cache ?? '—'}</dd>
        </div>
        <ProbeRow url={member.url} />
      </dl>
    </div>
  );
}
