import { type CSSProperties, useEffect, useId, useRef } from 'react';

import { Link } from 'react-router-dom';

import { useAtomValue } from 'jotai';
import { Globe, Laptop } from 'lucide-react';

import { CountryFlag } from '@/components/country-flag';
import { IpText, Pending } from '@/components/toolkit';
import { TrustGauge } from '@/components/trust-gauge';
import { Badge } from '@/components/ui/badge';
import { t } from '@/i18n';
import { maskedIp } from '@/lib/network';
import { cn } from '@/lib/utils';
import { hideIpAtom } from '@/store/privacy';
import type { QualityAssessment } from '@/views/ip/model/quality';

import './egress-motion.css';

type RouteMotionState = 'observed' | 'pending' | 'unavailable';

/** Keep decorative loops still when the observation diagram is not visible. */
function useVisibleMotion() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    let intersecting = true;
    const update = () => {
      node.dataset.live = intersecting && !document.hidden ? 'true' : 'false';
    };
    const observer = new IntersectionObserver(([entry]) => {
      intersecting = entry.isIntersecting;
      update();
    });
    observer.observe(node);
    document.addEventListener('visibilitychange', update);
    update();
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  return ref;
}

function AnimatedRoute({
  path,
  color,
  gradientId,
  state,
  delay,
  endY,
  glowId,
}: {
  path: string;
  color: string;
  gradientId: string;
  state: RouteMotionState;
  delay: number;
  endY: number;
  glowId: string;
}) {
  return (
    <g
      className="home-route"
      data-state={state}
      style={
        {
          '--route-color': color,
          '--route-stroke': `url(#${gradientId})`,
          '--route-delay': `${delay}s`,
        } as CSSProperties
      }
      aria-hidden="true">
      <path d={path} className="home-route-glow" />
      <path d={path} pathLength="100" className="home-route-track" />
      <path d={path} pathLength="100" className="home-route-stream" />
      {state === 'observed' ? (
        <g filter={`url(#${glowId})`}>
          <path d={path} pathLength="100" className="home-route-packet home-route-packet-tail" />
          <path d={path} pathLength="100" className="home-route-packet" />
          <path
            d={path}
            pathLength="100"
            className="home-route-packet home-route-packet-secondary"
          />
        </g>
      ) : null}
      <circle cx="584" cy={endY} r="10" className="home-route-ring" />
      <circle cx="584" cy={endY} r="10" className="home-route-ring home-route-ring-late" />
      <circle cx="584" cy={endY} r="4" className="home-route-node" />
    </g>
  );
}

export interface EgressCardData {
  index: number;
  role: 'domestic' | 'external' | 'shared';
  assessment: QualityAssessment | null;
  stale?: boolean;
  probeStale?: boolean;
  label: string;
  data?: { ip: string };
  geo?: {
    ip?: string;
    country_code?: string;
    country?: string;
    region?: string;
    city?: string;
    isp?: string;
    asn?: number | string;
  };
  version: number;
  hasScore: boolean;
  score?: number;
  typeLabels: Array<{ label: string; color: string }>;
  loading: boolean;
  pending: boolean;
  onRetry?: () => void;
}

export interface SplitTunnelVisualizerProps {
  isSplit: boolean;
  cardsData?: EgressCardData[];
  domesticIp?: string;
  domesticGeo?: {
    country?: string;
    region?: string;
    city?: string;
    country_code?: string;
    isp?: string;
  };
  domesticPending?: boolean;
  overseasIp?: string;
  overseasGeo?: {
    country?: string;
    region?: string;
    city?: string;
    country_code?: string;
    isp?: string;
  };
  overseasPending?: boolean;
}

function EgressCockpitPanel({ card, isDomestic }: { card: EgressCardData; isDomestic: boolean }) {
  const {
    label,
    data,
    geo,
    version,
    hasScore,
    score,
    typeLabels,
    loading,
    pending,
    onRetry,
    assessment,
    stale,
  } = card;

  const locationText = [geo?.country, geo?.region, geo?.city]
    .filter(Boolean)
    .filter((item, i, all) => all.indexOf(item) === i)
    .join(' · ');

  const networkText = [geo?.isp, geo?.asn ? `AS${geo.asn}` : undefined].filter(Boolean).join(' · ');

  return (
    <div
      className={`home-egress-card relative overflow-hidden p-4 sm:p-5 flex flex-col justify-between group/panel ${
        isDomestic ? 'is-domestic' : 'is-external'
      }`}>
      <Globe
        aria-hidden="true"
        className="home-egress-watermark pointer-events-none absolute -bottom-6 -right-4 size-32 -rotate-12"
      />
      {/* Full panel click target to inspect IP */}
      {data && (
        <Link
          to={`/network/ip/${encodeURIComponent(data.ip)}`}
          aria-label={`${label} · ${t('IP 信息查询')}`}
          className="absolute inset-0 z-10 rounded-xl transition-colors hover:bg-primary/[0.02] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        />
      )}

      {/* Top Header / Eyebrow & Badges */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-xs text-foreground/90 flex items-center gap-1.5">
              <span
                className={`home-egress-dot size-2 rounded-full ${
                  isDomestic
                    ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50'
                    : 'bg-sky-500 dark:bg-cyan-400 shadow-sm shadow-cyan-500/50'
                }`}
              />
              {label}
            </span>
            {typeLabels.map((type) => (
              <Badge
                key={type.label}
                variant="secondary"
                className={`h-4.5 px-2 text-[10px] font-semibold tracking-normal border border-border/60 ${type.color}`}>
                {type.label}
              </Badge>
            ))}
          </div>
        </div>

        {/* IP Address & Trust Score Row */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {pending ? (
              <Pending>{t('加载中...')}</Pending>
            ) : geo ? (
              <>
                <CountryFlag code={geo.country_code} />
                <span className="font-mono text-xl sm:text-2xl font-black tracking-tight text-foreground select-all tabular-nums">
                  <IpText ip={geo.ip || data?.ip || ''} link={false} />
                </span>
              </>
            ) : (
              <span className="muted font-mono text-sm">
                {t('未获取到 IPv')}
                {version}
              </span>
            )}
          </div>
          {hasScore && typeof score === 'number' && (
            <TrustGauge
              score={score}
              uncertain={assessment?.scoreStatus === 'provisional'}
              hint={t('0–100，越高越好。已读取来源按同一套公式计分，不是原始分平均。')}
            />
          )}
        </div>

        {assessment ? (
          <div className="mt-3 space-y-1.5 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="font-semibold">{assessment.headline}</strong>
              {assessment.scoreStatus === 'provisional' ? (
                <Badge variant="outline">{t('估算')}</Badge>
              ) : null}
              {stale ? <Badge variant="warning">{t('上次结果')}</Badge> : null}
            </div>
            <p className="text-muted-foreground leading-relaxed">{assessment.shortSummary}</p>
            <dl className="grid gap-1 pt-1">
              {assessment.keyEvidence.rows.slice(0, 3).map((row) => (
                <div className="flex justify-between gap-3" key={row.source}>
                  <dt className="text-muted-foreground">{row.source}</dt>
                  <dd className="m-0 text-right">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
        {/* Location & ISP Meta */}
        <div className="text-xs text-muted-foreground mt-3 pt-2.5 border-t border-border/40">
          {loading ? (
            <Pending>{t('正在查询归属信息…')}</Pending>
          ) : locationText || networkText ? (
            <>
              {locationText ? (
                <p className="font-medium text-foreground/90">{locationText}</p>
              ) : null}
              {networkText ? (
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">{networkText}</p>
              ) : null}
            </>
          ) : data ? (
            <div className="flex items-center justify-between gap-2 text-xs">
              <span>{t('归属信息暂不可用')}</span>
              {onRetry && (
                <button
                  type="button"
                  className="relative z-20 shrink-0 text-primary hover:underline cursor-pointer"
                  onClick={onRetry}>
                  {t('重试')}
                </button>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div className="home-egress-meta mt-3 pt-2.5 border-t border-border/30 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>
          {card.role === 'shared'
            ? t('两探针返回相同地址')
            : isDomestic
              ? t('国内探针观测')
              : t('外部探针观测')}
        </span>
        <span>{stale ? t('上次结果') : pending ? t('读取中…') : t('HTTP 回显')}</span>
      </div>
    </div>
  );
}

function capsulePlace(value?: string) {
  const text = value
    ?.replace(/\s*\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  return text.length > 28 ? `${text.slice(0, 27)}…` : text;
}

function FlowCapsule({
  x,
  y,
  title,
  kicker,
  ip,
  place,
  width = 156,
  accentClass,
  strokeClass,
  ipClass,
}: {
  x: number;
  y: number;
  title: string;
  kicker: string;
  ip: string;
  place?: string;
  width?: number;
  accentClass: string;
  strokeClass: string;
  ipClass: string;
}) {
  const clipId = useId().replace(/:/g, '');
  const location = capsulePlace(place);
  const height = location ? 50 : 40;
  return (
    <g transform={`translate(${x}, ${y})`} className="home-capsule">
      <clipPath id={clipId}>
        <rect x="8" y="1" width={width - 12} height={height - 2} rx="4" />
      </clipPath>
      <text x="2" y="-6" className="text-[10px] fill-foreground/90 font-mono font-bold">
        {title}
      </text>
      <rect
        x="0"
        y="0"
        width={width}
        height={height}
        rx="7"
        className={cn('fill-card/90 backdrop-blur-md', strokeClass)}
        strokeWidth="1.2"
      />
      <rect x="0" y="0" width="3.5" height={height} rx="1.5" className={accentClass} />
      <g clipPath={`url(#${clipId})`}>
        <text x="10" y="14" className="text-[8.5px] fill-muted-foreground font-mono font-medium">
          {kicker}
        </text>
        <text
          x="10"
          y="30"
          className={cn('text-[12px] font-mono font-bold tracking-tight select-all', ipClass)}>
          {ip}
        </text>
        {location ? (
          <text x="10" y="44" className="text-[8px] fill-muted-foreground/75 font-mono">
            {location}
          </text>
        ) : null}
      </g>
    </g>
  );
}

export function SplitTunnelVisualizer({
  isSplit,
  cardsData = [],
  domesticIp,
  domesticGeo,
  domesticPending,
  overseasIp,
  overseasGeo,
  overseasPending,
}: SplitTunnelVisualizerProps) {
  const hidden = useAtomValue(hideIpAtom);
  const motionRef = useVisibleMotion();
  const svgId = `home-flow-${useId().replace(/:/g, '')}`;
  const glowId = `${svgId}-glow`;
  const domesticGradientId = `${svgId}-grad-domestic`;
  const externalGradientId = `${svgId}-grad-external`;
  const domesticCard = cardsData.find((card) => card.role === 'domestic' || card.role === 'shared');
  const externalCard = cardsData.find((card) => card.role === 'external' || card.role === 'shared');
  const domestic = domesticCard?.data?.ip ?? domesticIp;
  const external = externalCard?.data?.ip ?? overseasIp;
  const domesticLocation = domesticCard?.geo?.city ?? domesticGeo?.city;
  const externalLocation = externalCard?.geo?.city ?? overseasGeo?.city;
  const domesticState: RouteMotionState = domesticPending
    ? 'pending'
    : domestic && !domesticCard?.probeStale
      ? 'observed'
      : 'unavailable';
  const externalState: RouteMotionState = overseasPending
    ? 'pending'
    : external && !externalCard?.probeStale
      ? 'observed'
      : 'unavailable';
  const current = (ip: string | undefined, pending: boolean | undefined) =>
    ip ? maskedIp(ip, hidden) : pending ? t('读取中…') : t('暂不可用');
  return (
    <div className="split-tunnel-stage w-full my-3 rounded-2xl bg-card border border-border shadow-sm overflow-hidden">
      <div ref={motionRef} className="home-egress-diagram p-3 sm:p-4 pb-2" data-live="true">
        <div className="sm:hidden space-y-3 pb-3 text-xs">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="home-device-mobile">
              <Laptop className="size-4" />
            </span>
            {t('当前浏览器')}
          </div>
          <dl className="ml-2 border-l border-border pl-4 space-y-2">
            <div
              className="home-route-mobile flex items-center justify-between gap-3"
              data-state={domesticState}
              style={
                {
                  '--route-color': 'var(--success)',
                  '--route-delay': '0s',
                } as CSSProperties
              }>
              <span className="home-route-mobile-track" aria-hidden="true">
                <span />
              </span>
              <dt className="text-muted-foreground">{t('国内探针观测')}</dt>
              <dd className="m-0 font-mono">{current(domestic, domesticPending)}</dd>
            </div>
            <div
              className="home-route-mobile flex items-center justify-between gap-3"
              data-state={externalState}
              style={
                {
                  '--route-color': 'var(--primary)',
                  '--route-delay': '-1.4s',
                } as CSSProperties
              }>
              <span className="home-route-mobile-track" aria-hidden="true">
                <span />
              </span>
              <dt className="text-muted-foreground">{t('外部探针观测')}</dt>
              <dd className="m-0 font-mono">{current(external, overseasPending)}</dd>
            </div>
          </dl>
        </div>
        <svg
          viewBox="0 0 860 174"
          className="hidden sm:block w-full min-h-[140px] max-h-[220px]"
          fill="none"
          role="img"
          aria-label={t('国内与外部 HTTP 探针出口对照')}>
          <defs>
            <linearGradient id={domesticGradientId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0" />
              <stop offset="28%" stopColor="#10b981" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#34d399" stopOpacity="1" />
            </linearGradient>
            <linearGradient id={externalGradientId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0" />
              <stop offset="28%" stopColor="#0ea5e9" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="1" />
            </linearGradient>
            <filter
              id={glowId}
              x="-10%"
              y="-35%"
              width="120%"
              height="170%"
              colorInterpolationFilters="sRGB">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <AnimatedRoute
            path="M 98 87 C 190 87, 210 43, 310 43 L 584 43"
            color="var(--success)"
            gradientId={domesticGradientId}
            state={domesticState}
            delay={0}
            endY={43}
            glowId={glowId}
          />
          <AnimatedRoute
            path="M 98 87 C 190 87, 210 130, 310 130 L 584 130"
            color="var(--primary)"
            gradientId={externalGradientId}
            state={externalState}
            delay={-1.4}
            endY={130}
            glowId={glowId}
          />
          <circle cx="98" cy="87" r="3.5" className="home-fork-node" />
          <circle cx="98" cy="87" r="9" className="home-fork-ring" />
          <circle cx="67" cy="86" r="46" className="home-device-orbit" />
          <rect
            x="30"
            y="49"
            width="74"
            height="74"
            rx="20"
            className="home-device-ring"
            aria-hidden="true"
          />
          <rect x="36" y="55" width="62" height="62" rx="15" className="fill-card stroke-border" />
          <foreignObject x="53" y="69" width="30" height="30">
            <Laptop className="size-7 text-foreground" />
          </foreignObject>
          <text x="67" y="139" textAnchor="middle" className="fill-muted-foreground text-[11px]">
            {t('当前浏览器')}
          </text>
          <text x="309" y="34" className="fill-muted-foreground text-[10px]">
            {t('国内探测端点')}
          </text>
          <text x="309" y="121" className="fill-muted-foreground text-[10px]">
            {t('外部探测端点')}
          </text>
          <FlowCapsule
            x={600}
            y={18}
            width={220}
            title={t('国内探针观测')}
            kicker={t('HTTP 回显')}
            ip={current(domestic, domesticPending)}
            place={domesticLocation}
            accentClass="fill-emerald-500"
            strokeClass="stroke-emerald-500/30"
            ipClass="fill-foreground"
          />
          <FlowCapsule
            x={600}
            y={104}
            width={220}
            title={t('外部探针观测')}
            kicker={t('HTTP 回显')}
            ip={current(external, overseasPending)}
            place={externalLocation}
            accentClass="fill-primary"
            strokeClass="stroke-primary/30"
            ipClass="fill-foreground"
          />
        </svg>
        <p className="text-[11px] text-muted-foreground leading-relaxed px-1">
          {t('连线仅表示探针与回显地址的对应关系，不据此直接判定分流规则已生效。')}
        </p>
      </div>
      <div
        className={`grid border-t border-border ${cardsData.length > 1 ? 'md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border' : 'grid-cols-1'}`}>
        {cardsData.map((card) => (
          <EgressCockpitPanel key={card.role} card={card} isDomestic={card.role !== 'external'} />
        ))}
      </div>
      {isSplit ? <p className="sr-only">{t('本轮观测到不同出口')}</p> : null}
    </div>
  );
}
