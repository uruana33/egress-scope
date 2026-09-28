import { type ReactNode, useEffect } from 'react';

import { Link } from 'react-router-dom';

import { useAtom, useAtomValue } from 'jotai';

import { AnimatedValue } from '@/components/animated-value';
import { CompactText } from '@/components/compact-text';
import { ActionSwapText } from '@/components/motion/action-swap';
import { DigitSwap } from '@/components/motion/digit-swap';
import { NumberTicker } from '@/components/number-ticker';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SweepShine } from '@/components/ui/sweep-shine';
import { Switch } from '@/components/ui/switch';
import { UnderlineHover } from '@/components/underline-hover';
import { t } from '@/i18n';
import { maskedIp } from '@/lib/network';
import { hideIpAtom } from '@/store/privacy';

const SWAPPABLE_LEN = 20;

function GlyphValue({ text, hidden }: { text: string; hidden: boolean }) {
  if (text.length > SWAPPABLE_LEN) {
    return (
      <AnimatedValue value={text}>
        <CompactText text={text} middle />
      </AnimatedValue>
    );
  }
  return (
    <DigitSwap
      value={text}
      direction={hidden ? 'down' : 'up'}
      animationKey={hidden ? 'hidden' : 'shown'}
    />
  );
}

export function PrivacyToggle() {
  const [hidden, setHidden] = useAtom(hideIpAtom);
  return (
    <label className="privacy-toggle">
      <span>{t('隐藏IP')}</span>
      <Switch aria-label={t('隐藏 IP 地址')} checked={hidden} onCheckedChange={setHidden} />
    </label>
  );
}

export function PageHeading({
  title,
  description,
  privacy = false,
  actions,
}: {
  title: string;
  description?: string;
  privacy?: boolean;
  actions?: ReactNode;
}) {
  useEffect(() => {
    document.title = title;
  }, [title]);
  return (
    <header className="page-header">
      <div className="page-header-text">
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions}
      {privacy && <PrivacyToggle />}
    </header>
  );
}

export function IpText({ ip, link = true }: { ip?: string; link?: boolean }) {
  const hidden = useAtomValue(hideIpAtom);
  if (!ip) return <span className="muted">{t('未知')}</span>;
  const glyphs = <GlyphValue text={maskedIp(ip, hidden)} hidden={hidden} />;
  if (!link || hidden) return <span className="ip-text">{glyphs}</span>;
  return (
    <UnderlineHover asChild>
      <Link className="ip-text" to={`/network/ip/${encodeURIComponent(ip)}`}>
        {glyphs}
      </Link>
    </UnderlineHover>
  );
}

export function ToolCard({
  title,
  children,
  className = '',
}: {
  title: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={['tool-card', 'cyber-card', className].join(' ').trim()}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function FactValue({ value }: { value: ReactNode }) {
  const animatable = typeof value === 'string' || typeof value === 'number' ? value : undefined;
  return (
    <AnimatedValue value={animatable}>
      {typeof value === 'number' ? <NumberTicker value={value} /> : (value ?? t('未知'))}
    </AnimatedValue>
  );
}

export function Facts({
  rows,
  renderLabel,
}: {
  rows: [string, ReactNode][];
  renderLabel?: (label: string) => ReactNode;
}) {
  return (
    <dl className="facts">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{renderLabel?.(label) ?? label}</dt>
          <dd>
            <FactValue value={value} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function Pending({ children = t('检测中…') }: { children?: ReactNode }) {
  return <SweepShine role="status">{children}</SweepShine>;
}

export function ErrorNotice({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  return (
    <Alert variant="destructive" className="error-notice">
      <AlertDescription>
        <AnimatedValue value={message}>{message}</AnimatedValue>
      </AlertDescription>
    </Alert>
  );
}

export function ActionButton({
  busy,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { busy?: boolean }) {
  const plain = typeof children === 'string' ? children : null;
  const content = plain ? (
    <ActionSwapText value={plain} animation="cascade">
      {plain}
    </ActionSwapText>
  ) : busy ? (
    <Pending>
      <span className="inline-flex items-center justify-center gap-2 whitespace-nowrap">
        {children}
      </span>
    </Pending>
  ) : (
    children
  );
  return (
    <Button
      {...props}
      disabled={busy || props.disabled}
      aria-busy={busy}
      className={`action-button ${props.className ?? ''}`}>
      {content}
    </Button>
  );
}

export function ReadingLinks({
  links,
  title = t('拓展阅读'),
}: {
  links: { path: string; title: string }[];
  title?: string;
}) {
  return (
    <section className="reading">
      <h2>{title}</h2>
      <div className="reading-grid">
        {links.map((item) => (
          <UnderlineHover asChild key={item.path}>
            <Link to={item.path}>{item.title}</Link>
          </UnderlineHover>
        ))}
      </div>
    </section>
  );
}
