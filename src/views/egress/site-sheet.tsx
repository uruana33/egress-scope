import { Link } from 'react-router-dom';

import { CopyButton } from '@/components/copy-button';
import { CountryFlag } from '@/components/country-flag';
import { SiteLogo } from '@/components/site-logo';
import { IpText, Pending } from '@/components/toolkit';
import { t } from '@/i18n';

import {
  type EgressSheetSite,
  formatProbeMs,
  geoLine,
  methodLabel,
  probeParts,
  probeTarget,
  siteChip,
  siteDisplayName,
  siteReason,
  siteSubtitle,
  siteTone,
} from './sheet';

export function EgressSiteTitle({ site }: { site: EgressSheetSite }) {
  return (
    <span className="egress-sheet-title">
      <SiteLogo src={site.icon} website={site.sourceUrl} className="size-7 rounded-md" />
      <span className="egress-sheet-title-text">{siteDisplayName(site.name)}</span>
    </span>
  );
}

export function EgressSiteDescription({ site }: { site: EgressSheetSite }) {
  return (
    <>
      <span className="egress-sheet-sub">{siteSubtitle(site)}</span>
      <span className="egress-sheet-chip" data-state={siteTone(site)}>
        {siteChip(site)}
      </span>
    </>
  );
}

export function EgressExitTitle({ ip, geo }: { ip: string; geo?: GeoLike }) {
  return (
    <span className="egress-sheet-title">
      <CountryFlag code={geo?.country_code} />
      <span className="egress-sheet-title-text egress-sheet-title-ip">
        <IpText ip={ip} link={false} />
      </span>
      <CopyButton value={ip} />
    </span>
  );
}

export function EgressExitDescription({ geo, count }: { geo?: GeoLike; count: number }) {
  const location = geoLine(geo);
  return (
    <>
      <span className="egress-sheet-sub">{location || t('归属信息暂不可用')}</span>
      <span className="egress-sheet-chip" data-state="ok">
        {count} {t('站')}
      </span>
    </>
  );
}

type GeoLike = {
  country?: string;
  city?: string;
  isp?: string;
  country_code?: string;
};

export function EgressSiteSheet({
  site,
  siblingCount,
  onSelectExit,
}: {
  site: EgressSheetSite;
  siblingCount: number;
  onSelectExit: (ip: string) => void;
}) {
  const tone = siteTone(site);
  const ip = site.geo?.ip;
  const reason = siteReason(site);
  const probe = probeTarget(site);
  const parsedProbe = probe ? probeParts(probe) : undefined;
  const duration = formatProbeMs(site.diagnostic?.networkMs ?? site.diagnostic?.totalMs);
  const queued = formatProbeMs(site.diagnostic?.queueWaitMs);
  const showQueue = site.diagnostic?.queueWaitMs != null && site.diagnostic.queueWaitMs >= 1000;

  return (
    <div className="egress-sheet">
      <div className="egress-sheet-exit" data-state={tone}>
        {tone === 'pending' ? (
          <Pending>{t('检测中…')}</Pending>
        ) : ip ? (
          <>
            <div className="egress-sheet-ip">
              <CountryFlag code={site.geo?.country_code} />
              <IpText ip={ip} link={false} />
              <CopyButton value={ip} />
            </div>
            <p className="egress-sheet-geo">
              {site.geoPending ? t('归属查询中…') : geoLine(site.geo) || t('归属信息暂不可用')}
            </p>
            <div className="egress-sheet-exit-actions">
              <Link className="egress-sheet-link" to={`/network/ip/${encodeURIComponent(ip)}`}>
                {t('查看地址档案')}
              </Link>
              {siblingCount > 1 ? (
                <button
                  type="button"
                  className="egress-sheet-link"
                  onClick={() => onSelectExit(ip)}>
                  {t('另有 {0} 站走同一出口', [siblingCount - 1])}
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <p className="egress-sheet-miss">{t('未读到出口')}</p>
            {reason ? <p className="egress-sheet-geo">{reason}</p> : null}
          </>
        )}
      </div>
      <dl className="egress-sheet-facts">
        <div>
          <dt>{t('探测方式')}</dt>
          <dd>{methodLabel(site)}</dd>
        </div>
        {duration ? (
          <div>
            <dt>{t('探测耗时')}</dt>
            <dd>{duration}</dd>
          </div>
        ) : null}
        {showQueue && queued ? (
          <div>
            <dt>{t('排队')}</dt>
            <dd>{queued}</dd>
          </div>
        ) : null}
        {parsedProbe ? (
          <div>
            <dt>{t('探针')}</dt>
            <dd className="egress-sheet-probe">
              <span className="egress-sheet-probe-url">
                <span>{parsedProbe.host}</span>
                {parsedProbe.path ? <span>{parsedProbe.path}</span> : null}
              </span>
              <CopyButton value={probe} />
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

export function EgressExitSheet({
  ip,
  sites,
  onSelectSite,
}: {
  ip: string;
  sites: readonly EgressSheetSite[];
  onSelectSite: (id: string) => void;
}) {
  return (
    <div className="egress-sheet">
      <div className="egress-sheet-exit-actions">
        <Link className="egress-sheet-link" to={`/network/ip/${encodeURIComponent(ip)}`}>
          {t('查看地址档案')}
        </Link>
      </div>
      <ul className="egress-sheet-sites">
        {sites.map((site) => (
          <li key={site.id}>
            <button
              type="button"
              className="egress-sheet-site"
              onClick={() => onSelectSite(site.id)}>
              <SiteLogo src={site.icon} website={site.sourceUrl} className="size-5 rounded-md" />
              <span className="egress-sheet-site-name">{siteDisplayName(site.name)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
