import { Link } from 'react-router-dom';

import { CopyButton } from '@/components/copy-button';
import { CountryFlag } from '@/components/country-flag';
import { SiteLogo } from '@/components/site-logo';
import { IpText } from '@/components/toolkit';
import { t } from '@/i18n';

import {
  type DnsLane,
  type DnsLaneMember,
  type DnsLaneSource,
  dnsFamily,
  dnsGeoLabel,
  dnsLaneFamilies,
  geoFromDns,
} from './dns-lanes';
import { geoLine } from './sheet';
import { EgressExitTitle } from './site-sheet';

export { EgressExitTitle };

export function DnsExitDescription({ lane }: { lane: DnsLane }) {
  const families = dnsLaneFamilies(lane)
    .map((family) => (family === 'ipv4' ? 'IPv4' : 'IPv6'))
    .join(' / ');
  const place = [lane.geo?.country, lane.geo?.city].filter(Boolean).join(', ');
  return (
    <>
      <span className="egress-sheet-sub">
        {[lane.operatorLabel, families, place].filter(Boolean).join(' · ') || t('归属信息暂不可用')}
      </span>
      <span className="egress-sheet-chip" data-state="ok">
        {lane.members.length} {t('个解析器')}
      </span>
    </>
  );
}

export function DnsSourceTitle({ source }: { source: DnsLaneSource }) {
  return (
    <span className="egress-sheet-title">
      <SiteLogo website={source.meta.website} className="size-7 rounded-md" />
      <span className="egress-sheet-title-text">{source.name}</span>
    </span>
  );
}

export function DnsSourceDescription({
  source,
  groupLabel,
  blocked,
}: {
  source: DnsLaneSource;
  groupLabel?: string;
  blocked?: boolean;
}) {
  const group =
    groupLabel ||
    (source.meta.group === 'vendor'
      ? t('商业探测')
      : source.meta.group === 'cdn'
        ? t('CDN 探测')
        : source.meta.group === 'leak'
          ? t('泄漏测试')
          : source.meta.group === 'domestic'
            ? t('国内探测')
            : t('探测源'));
  return (
    <>
      <span className="egress-sheet-sub">{group}</span>
      <span className="egress-sheet-chip" data-state={blocked ? 'blocked' : 'ok'}>
        {blocked ? t('受阻') : `${source.samples} ${t('次')}`}
      </span>
    </>
  );
}

function MemberRow({ member }: { member: DnsLaneMember }) {
  const parsed = geoFromDns(member);
  const detail = dnsGeoLabel(member);
  return (
    <li className="egress-sheet-ip-item">
      <Link className="egress-sheet-site" to={`/network/ip/${encodeURIComponent(member.ip)}`}>
        <CountryFlag code={member.country_code ?? parsed.country_code} />
        <span className="egress-sheet-site-name">
          <IpText ip={member.ip} link={false} />
        </span>
      </Link>
      <p className="egress-sheet-geo">
        {member.samples} {t('次')}
        {detail ? ` · ${detail}` : ''}
      </p>
    </li>
  );
}

export function DnsMemberDescription({
  member,
  operatorLabel,
}: {
  member: DnsLaneMember;
  operatorLabel?: string;
}) {
  const family = dnsFamily(member.ip) === 'ipv6' ? 'IPv6' : 'IPv4';
  return (
    <>
      <span className="egress-sheet-sub">
        {[operatorLabel, family].filter(Boolean).join(' · ')}
      </span>
      <span className="egress-sheet-chip" data-state="ok">
        {member.samples} {t('次')}
      </span>
    </>
  );
}

export function DnsMemberSheet({ member, lane }: { member: DnsLaneMember; lane?: DnsLane }) {
  const parsed = geoFromDns(member);
  return (
    <div className="egress-sheet">
      <div className="egress-sheet-exit-actions">
        <Link className="egress-sheet-link" to={`/network/ip/${encodeURIComponent(member.ip)}`}>
          {t('查看地址档案')}
        </Link>
      </div>
      <div className="egress-sheet-exit" data-state="ok">
        <div className="egress-sheet-ip">
          <CountryFlag code={member.country_code ?? parsed.country_code} />
          <IpText ip={member.ip} link={false} />
          <CopyButton value={member.ip} />
        </div>
        <p className="egress-sheet-geo">
          {dnsGeoLabel(member) || geoLine(parsed) || t('归属信息暂不可用')}
        </p>
      </div>
      <dl className="egress-sheet-facts">
        <div>
          <dt>{t('运营商')}</dt>
          <dd>{lane?.operatorLabel ?? dnsGeoLabel(member)}</dd>
        </div>
        <div>
          <dt>{t('观察次数')}</dt>
          <dd>
            {member.samples} {t('次')}
          </dd>
        </div>
      </dl>
      {member.sources.length ? (
        <section className="egress-sheet-section">
          <h3 className="egress-sheet-section-label">{t('探测源')}</h3>
          <ul className="egress-sheet-sites">
            {member.sources.map((name) => (
              <li key={name} className="egress-sheet-ip-item">
                <span className="egress-sheet-site">
                  <SiteLogo
                    website={lane?.sources.find((source) => source.name === name)?.meta.website}
                    className="size-5 rounded-md"
                  />
                  <span className="egress-sheet-site-name">{name}</span>
                  <span className="egress-sheet-site-meta">
                    {member.sourceSamples[name] ?? member.samples} {t('次')}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export function DnsExitSheet({
  lane,
  onSelectSource,
}: {
  lane: DnsLane;
  onSelectSource: (id: string) => void;
}) {
  const families = dnsLaneFamilies(lane);
  return (
    <div className="egress-sheet">
      {lane.ip ? (
        <div className="egress-sheet-exit-actions">
          <Link className="egress-sheet-link" to={`/network/ip/${encodeURIComponent(lane.ip)}`}>
            {t('查看地址档案')}
          </Link>
        </div>
      ) : null}
      {families.map((family) => {
        const members = lane.members.filter((member) => dnsFamily(member.ip) === family);
        return (
          <section key={family} className="egress-sheet-section">
            <h3 className="egress-sheet-section-label">
              {family === 'ipv4' ? 'IPv4' : 'IPv6'}
              <span>
                {members.length} {t('个解析器')}
              </span>
            </h3>
            <ul className="egress-sheet-sites egress-sheet-ips">
              {members.map((member) => (
                <MemberRow key={member.ip} member={member} />
              ))}
            </ul>
          </section>
        );
      })}
      {lane.sources.length ? (
        <section className="egress-sheet-section">
          <h3 className="egress-sheet-section-label">{t('探测源')}</h3>
          <ul className="egress-sheet-sites">
            {lane.sources.map((source) => (
              <li key={source.name}>
                <button
                  type="button"
                  className="egress-sheet-site"
                  onClick={() => onSelectSource(source.name)}>
                  <SiteLogo website={source.meta.website} className="size-5 rounded-md" />
                  <span className="egress-sheet-site-name">{source.name}</span>
                  <span className="egress-sheet-site-meta">
                    {source.samples} {t('次')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export function DnsSourceSheet({
  source,
  lane,
  members,
  blocked,
}: {
  source: DnsLaneSource;
  lane?: DnsLane;
  members: readonly DnsLaneMember[];
  blocked?: boolean;
}) {
  const probe = `https://${source.meta.host}${source.meta.path === '/' ? '' : source.meta.path}`;
  const featured = members[0];
  const featuredGeo = featured ? geoFromDns(featured) : lane?.geo;
  const featuredIp = featured?.ip ?? lane?.ip;
  return (
    <div className="egress-sheet">
      <div className="egress-sheet-exit" data-state={blocked ? 'blocked' : 'ok'}>
        {blocked ? (
          <p className="egress-sheet-miss">{t('接口不可读或跨域受限')}</p>
        ) : featuredIp ? (
          <>
            <div className="egress-sheet-ip">
              <CountryFlag code={featuredGeo?.country_code} />
              <IpText ip={featuredIp} link={false} />
              <CopyButton value={featuredIp} />
            </div>
            <p className="egress-sheet-geo">
              {featured ? dnsGeoLabel(featured) : geoLine(lane?.geo) || t('归属信息暂不可用')}
            </p>
          </>
        ) : (
          <p className="egress-sheet-miss">{t('还没有读到 DNS 出口')}</p>
        )}
      </div>
      <dl className="egress-sheet-facts">
        <div>
          <dt>{t('探测源')}</dt>
          <dd>{source.name}</dd>
        </div>
        <div>
          <dt>{t('观察次数')}</dt>
          <dd>
            {source.samples} {t('次')}
          </dd>
        </div>
        <div>
          <dt>{t('探针')}</dt>
          <dd className="egress-sheet-probe">
            <span className="egress-sheet-probe-url">
              <span>{source.meta.host}</span>
              {source.meta.path && source.meta.path !== '/' ? (
                <span>{source.meta.path}</span>
              ) : null}
            </span>
            <CopyButton value={probe} />
          </dd>
        </div>
      </dl>
      {members.length ? (
        <section className="egress-sheet-section">
          <h3 className="egress-sheet-section-label">{t('该探测源看到的出口')}</h3>
          <ul className="egress-sheet-sites egress-sheet-ips">
            {members.map((member) => (
              <MemberRow key={member.ip} member={member} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
