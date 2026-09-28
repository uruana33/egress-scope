import { Link } from 'react-router-dom';

import { CountryFlag } from '@/components/country-flag';
import { IpText, Pending } from '@/components/toolkit';
import { t } from '@/i18n';
import type { Geo } from '@/lib/types';

export function SplitExitTiles({
  exits,
  totalSites,
  rowsWithGeo,
  pending,
  onSelectIp,
}: {
  exits: { geo: Geo; count: number }[];
  totalSites: number;
  rowsWithGeo: number;
  pending: boolean;
  onSelectIp: (ip: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {exits.map(({ geo, count }) => (
          <ExitTile key={geo.ip} geo={geo} count={count} onOpen={() => onSelectIp(geo.ip)} />
        ))}
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/40">
        {pending ? (
          <Pending>{t('正在检测分流出口…')}</Pending>
        ) : (
          <span>
            {t('已读取 {0}/{1} 个站点的出口{2}', [
              rowsWithGeo,
              totalSites,
              !exits.length ? t('，暂无可显示结果') : '',
            ])}
          </span>
        )}
        <Link
          to="/network/egress"
          className="text-primary hover:underline inline-flex items-center gap-1 text-[11px]">
          {t('查看全部 ›')}
        </Link>
      </div>
    </div>
  );
}

function ExitTile({ geo, count, onOpen }: { geo: Geo; count: number; onOpen: () => void }) {
  const location = [geo.country, geo.city].filter(Boolean).join(' · ');
  return (
    <div className="group relative flex items-center justify-between gap-2.5 rounded-xl border border-border/60 bg-card/60 p-2.5 backdrop-blur-sm transition-[border-color,background-color,box-shadow,transform] duration-200 ease-out hover:border-primary/40 hover:bg-card hover:shadow-sm hover:-translate-y-0.5">
      <div className="flex items-center gap-2.5 min-w-0">
        <CountryFlag code={geo.country_code} />
        <div className="flex flex-col min-w-0 text-left">
          <div className="font-mono text-xs font-semibold tracking-tight text-foreground truncate">
            <IpText ip={geo.ip} />
          </div>
          <span className="text-[11px] text-muted-foreground truncate">
            {location || geo.isp || '—'}
          </span>
        </div>
      </div>
      <button
        type="button"
        className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-[11px] font-medium transition-colors cursor-pointer"
        onClick={onOpen}>
        <span>
          {count} {t('个站点')}
        </span>
      </button>
    </div>
  );
}
