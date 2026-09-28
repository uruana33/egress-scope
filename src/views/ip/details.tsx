import { type ReactNode } from 'react';

import { useQuery } from '@tanstack/react-query';
import { useAtom } from 'jotai';
import { ClipboardCopy, Eye, EyeOff, Link2 } from 'lucide-react';
import { toast } from 'sonner';

import { CopyButton } from '@/components/copy-button';
import { CountryFlag } from '@/components/country-flag';
import { Button } from '@/components/ui/button';
import { t } from '@/i18n';
import { queryKeys } from '@/lib/query-keys';
import { hideIpAtom } from '@/store/privacy';
import { getBrowserIp } from '@/views/home/api';
import { FolioFold } from '@/views/lookup/folio-fold';
import type { LookupView } from '@/views/lookup/href';
import PingPanel from '@/views/ping';
import WhoisPanel from '@/views/whois';

import type { CoffeeLookup } from './coffee';
import { QualityBoard } from './components/quality-board';
import { RawPayload } from './components/raw-payload';
import { SourceList } from './components/source-list';
import { IpFacts } from './field-help';
import { useIpCross } from './hooks/use-ip-cross';
import { useTerminalEgress } from './hooks/use-terminal-egress';
import { IpLatency } from './latency';
import { consensusPlace } from './model/place';
import { assessQuality } from './model/quality';
import { buildReport } from './model/report';
import { sameIp } from './model/terminal-egress';
import { chip } from './panels/cells';
import { ExtraCards } from './panels/extra-cards';
import { HistoryPanel } from './panels/history-panel';
import IpRouteGraph from './route-graph';
import { ScenarioPanel } from './scenario-panel';
import { useIpLatency } from './use-ip-latency';

async function copyText(value: string, doneMessage: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(doneMessage);
  } catch {
    toast.error(t('自动复制失败，请长按或选中链接复制。'));
  }
}

export function IpDetails({
  data,
  view,
  banner,
  search,
}: {
  data: CoffeeLookup;
  view?: LookupView;
  banner?: ReactNode;
  search?: ReactNode;
}) {
  const [hidden, setHidden] = useAtom(hideIpAtom);
  const d = data.coffee;
  const intel = useIpCross(d.ip);
  const inbound = useIpLatency(d.ip);
  const terminal = useTerminalEgress();
  const version = d.ip.includes(':') ? 6 : 4;
  const browser = useQuery({
    queryKey: queryKeys.home.browserIp(version),
    queryFn: ({ signal }: { signal: AbortSignal }) => getBrowserIp(version, signal),
    staleTime: 60_000,
    retry: false,
  });
  const pending = intel.isFetching && !intel.data;
  const assessment = assessQuality(d, intel.data ?? null, {
    pending,
    terminal: terminal.reading,
    selfLookup: sameIp(browser.data?.ip, d.ip),
  });
  const place = consensusPlace(d, intel.data ?? null, intel.isFetching && !intel.data);
  const geoLine = place.line;
  const coords =
    typeof place.latitude === 'number' && typeof place.longitude === 'number'
      ? `${place.latitude.toFixed(4)}, ${place.longitude.toFixed(4)}`
      : undefined;
  const placeTone = place.pending
    ? 'neutral'
    : place.split
      ? 'warn'
      : place.located >= 2
        ? 'good'
        : 'neutral';
  const placeChip = place.pending
    ? t('正在核对')
    : place.split
      ? t('存在分歧')
      : place.located >= 2
        ? t('已读来源一致')
        : place.located === 1
          ? t('单一来源')
          : t('未知');

  return (
    <article className="ip-folio">
      <header className="ip-folio-mast">
        <h1 className="sr-only">{d.ip}</h1>
        {banner}
        {search ? (
          <div className={hidden ? 'ip-folio-query is-masked' : 'ip-folio-query'}>
            <div className="ip-folio-query-field">{search}</div>
            <div className="ip-folio-query-tools">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={hidden ? t('显示 IP 地址') : t('隐藏 IP 地址')}
                title={hidden ? t('显示 IP 地址') : t('隐藏 IP 地址')}
                aria-pressed={hidden}
                onClick={() => setHidden((value) => !value)}>
                {hidden ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
              </Button>
              <CopyButton value={d.ip} />
              <span className="ip-folio-query-split" aria-hidden="true" />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t('复制报告')}
                title={t('复制报告')}
                onClick={() =>
                  void copyText(buildReport(data, intel.data, { pending }), t('报告已复制'))
                }>
                <ClipboardCopy aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t('复制链接')}
                title={t('复制链接')}
                onClick={() =>
                  void copyText(
                    `${window.location.origin}/network/ip/${encodeURIComponent(d.ip)}`,
                    t('链接已复制')
                  )
                }>
                <Link2 aria-hidden="true" />
              </Button>
            </div>
          </div>
        ) : null}
        <div className="ip-folio-ident">
          <p className="ip-folio-dek">
            <CountryFlag code={data.geo.country_code} />
            <span>{geoLine}</span>
          </p>
        </div>
        <QualityBoard
          assessment={assessment}
          queriedIp={d.ip}
          terminal={terminal.reading}
          terminalError={terminal.error}
          hidden={hidden}
          onTerminalPaste={(value) => !!terminal.submit(value)}
          onTerminalClear={terminal.clear}
        />
      </header>

      <div className="ip-folio-sheet">
        <section className="ip-folio-col">
          <p className="ip-folio-kicker">
            <span>{t('位置')}</span>
            {chip(placeChip, placeTone)}
          </p>
          <IpFacts
            rows={(
              [
                [
                  t('国家 / 地区'),
                  place.country && place.country !== place.city ? place.country : undefined,
                ],
                [
                  t('地区'),
                  place.region && place.region !== place.city && place.region !== place.country
                    ? place.region
                    : undefined,
                ],
                [t('坐标'), coords],
                [t('数据来源'), t('{0} / {1} 家已定位', [place.located, place.total])],
              ] as [string, ReactNode | undefined][]
            ).filter((pair): pair is [string, ReactNode] => pair[1] != null && pair[1] !== '')}
          />
        </section>

        <section className="ip-folio-col">
          <p className="ip-folio-kicker">
            <span>{t('网络')}</span>
          </p>
          <IpFacts
            rows={[
              ['ASN', d.asn ? `AS${d.asn}` : undefined],
              [t('服务商'), d.isp],
              [t('ASN 归属'), d.asname],
              ['CIDR', d.cidr],
              [t('ASN 自报类型'), d.asn_kind],
              [t('企业类型'), d.company_type],
              [t('地址类型'), d.ip.includes(':') ? 'IPv6' : 'IPv4'],
              [t('注册国家'), d.registered_country],
            ]}
          />
        </section>
      </div>

      <IpLatency ip={d.ip} layout="meter" />

      {view === 'ping' ? (
        <section id="lookup-ping" className="ip-folio-ping">
          <PingPanel host={d.ip} hideSearch />
        </section>
      ) : null}

      <FolioFold
        id="lookup-whois"
        title={t('注册局记录')}
        hint={t('登记信息，不能用来判断服务器在哪')}
        open={view === 'whois'}>
        <WhoisPanel query={d.ip} compact embedded plain />
      </FolioFold>

      <FolioFold title={t('多源位置对比')} hint={t('9 家目录里已读到城市的来源，按多数定标题位置')}>
        <SourceList votes={place.votes} majorityCity={place.city} />
      </FolioFold>

      <FolioFold title={t('更多网络与风险')}>
        <ExtraCards d={d} />
      </FolioFold>

      <FolioFold title={t('使用场景')} hint={t('当前浏览器公开端点访问参考；不代表查询 IP 能力')}>
        <ScenarioPanel ip={d.ip} inbound={inbound} />
      </FolioFold>

      <FolioFold title={t('BGP 路由拓扑')} hint={t('观测到的宣告路径，不是实时路由表')}>
        <IpRouteGraph ip={d.ip} currentAsn={d.asn} currentAsnName={d.asname} />
      </FolioFold>

      <FolioFold title={t('历史记录')}>
        <HistoryPanel d={d} />
      </FolioFold>

      <RawPayload data={d} />
    </article>
  );
}
