import { useLayoutEffect, useRef, useState } from 'react';

import { useQueries } from '@tanstack/react-query';
import { gsap } from 'gsap';
import { useAtomValue } from 'jotai';

import { ActionButton } from '@/components/toolkit';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import { t } from '@/i18n';
import { hideIpAtom } from '@/store/privacy';

import { type DetectOutcome, SIGNALS } from '../../../vendor/claude-environment/signals';
import { detectSignal, outcomeStatus, summarizeSignals } from './score';

const SIGNAL_LABELS = [
  '系统时区',
  '浏览器语言',
  '已安装中文字体',
  '厂商及软件字体',
  'WebRTC 候选地址',
  '浏览器 / WebView 标记',
  '设备厂商标记',
  '日期格式区域',
  '时区偏移',
  'Emoji 风格线索',
] as const;

type Status = ReturnType<typeof outcomeStatus>;

const STATUS_TEXT: Record<Status, () => string> = {
  pending: () => t('等待检测'),
  observed: () => t('已观测'),
  unknown: () => t('未知'),
  unavailable: () => t('不可用'),
};

const STATUS_CLASS: Record<Status, string> = {
  observed: 'text-foreground',
  unknown: 'text-amber-600',
  unavailable: 'text-destructive',
  pending: 'text-muted-foreground',
};

const RAW_TEXT: Record<string, () => string> = {
  'none detected': () => t('未检测到明确标记'),
  'canvas unavailable': () => t('Canvas 不可用'),
  'WebRTC unavailable': () => t('WebRTC 不可用'),
  'WebRTC check unavailable': () => t('WebRTC 检测不可用'),
  'WebRTC check timed out': () => t('WebRTC 检测超时'),
  'ICE candidate collection timed out': () => t('ICE 候选收集超时'),
  'ICE candidate check failed': () => t('ICE 候选检测失败'),
  'ICE candidate address unavailable': () => t('ICE 候选地址不可读'),
  'no ICE address candidate observed': () => t('未观测到 ICE 地址候选'),
};

function readableRaw(raw: string | undefined): string {
  if (!raw) return t('未知');
  const direct = RAW_TEXT[raw];
  if (direct) return direct();
  const candidate = raw.match(/^(public|non-public) candidate observed \((.*)\)$/);
  if (candidate) {
    return candidate[1] === 'public'
      ? t('公网候选：{0}', [candidate[2]])
      : t('非公网候选：{0}', [candidate[2]]);
  }
  if (/ style$/.test(raw)) return t('UA 推测的 {0}', [raw.replace(/ style$/, '')]);
  return raw;
}

function summaryText(busy: boolean, result: ReturnType<typeof summarizeSignals>) {
  if (busy) return t('检测中…');
  if (result.complete) return t('检测已完成');
  if (result.status === 'unavailable') return t('部分检测不可用');
  if (result.status === 'unknown') return t('存在未知结果');
  return t('检测未完成');
}

export function EnvironmentScore() {
  const content = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const hidden = useAtomValue(hideIpAtom);
  const queries = useQueries({
    queries: SIGNALS.map((definition) => ({
      queryKey: ['claude-upstream-signal', definition.id],
      queryFn: () => detectSignal(definition),
      retry: false,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    })),
  });
  const busy = queries.some((query) => query.isFetching);
  const outcomes = queries.map((query): DetectOutcome | undefined => {
    if (query.isFetching || query.isPending) return undefined;
    if (query.isError) return { raw: '检测失败或超时', status: 'unavailable' };
    return query.data;
  });
  const result = summarizeSignals(outcomes);
  const completed = queries.filter((query) => !query.isFetching && !query.isPending).length;

  useLayoutEffect(() => {
    if (!content.current) return;
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      const context = gsap.context(() => {
        gsap.fromTo(
          '[data-scan-enter]',
          { autoAlpha: 0, y: 6 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.3,
            stagger: 0.035,
            ease: 'power2.out',
            clearProps: 'opacity,visibility,transform',
          }
        );
      }, content);
      return () => context.revert();
    });
    return () => media.revert();
  }, [busy]);

  const summary = summaryText(busy, result);

  const detailFor = (i: number) => {
    const query = queries[i];
    if (query.isFetching || query.isPending) return t('等待结果…');
    if (query.isError) return t('检测失败或超时');
    if (SIGNALS[i].id === 'webrtcLeak' && hidden) return t('IP 已隐藏');
    return readableRaw(outcomes[i]?.raw);
  };

  const logDetails = outcomes.map((_, i) => detailFor(i));

  return (
    <Card className="cyber-card">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{t('浏览器环境信号')}</CardTitle>
          <ActionButton
            size="sm"
            variant="ghost"
            busy={busy}
            onClick={() => queries.forEach((query) => void query.refetch())}>
            {busy ? t('检测中…') : t('重新检测')}
          </ActionButton>
        </div>
      </CardHeader>
      <CardContent ref={content} className="space-y-3">
        <div className="grid gap-5 py-2 md:grid-cols-[220px_minmax(0,1fr)]" aria-live="polite">
          <div className="space-y-2 md:border-r md:pr-5">
            <div className="flex items-baseline gap-3">
              <div className="text-4xl font-medium tabular-nums">
                {result.observedCount}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  / {SIGNALS.length}
                </span>
              </div>
              <span className="text-sm font-medium">{summary}</span>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              {busy
                ? t('正在检测环境特征…')
                : t(
                    '这里展示浏览器本次可观察到的环境信号和检测完成度，不推断用户所在地、账号状态或平台判定。'
                  )}
            </p>
          </div>
          <div data-scan-enter className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
            {SIGNALS.map((definition, i) => {
              const status = outcomeStatus(outcomes[i]);
              return (
                <div key={definition.id} className="min-w-0 border-b border-border/50 py-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">{t(SIGNAL_LABELS[i])}</span>
                    <span className={`shrink-0 text-xs ${STATUS_CLASS[status]}`}>
                      {STATUS_TEXT[status]()}
                    </span>
                  </div>
                  <p className="mt-1 break-words text-xs text-foreground/80">{logDetails[i]}</p>
                </div>
              );
            })}
            {busy && (
              <p className="col-span-full text-xs text-muted-foreground" role="status">
                {t('检测进度：{0}/{1}', [completed, SIGNALS.length])}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between border-t pt-3">
          <details className="min-w-0 flex-1 text-sm">
            <summary className="w-fit cursor-pointer text-muted-foreground hover:text-foreground">
              {t('检测来源与修改说明')}
            </summary>
            <div className="mt-3 space-y-3 pr-3 text-xs leading-6 text-muted-foreground">
              <ul className="list-disc space-y-1 pl-4">
                <li>{t('语言、字体、设备与 Emoji 是环境线索，不单独推断国家或账号风险。')}</li>
                <li>
                  {t(
                    'WebRTC 候选地址只展示本次观测；私网候选不视为泄漏，公网候选也不自动判定为泄漏。'
                  )}
                </li>
                {!result.complete && <li>{t('部分检测未完成，请查看日志定位失败项后重试。')}</li>}
              </ul>
              <p>
                {t(
                  '检测列表参考 FuckClaude（MIT）；本站对检测状态、超时和 WebRTC 候选解析做了本地处理，结果不代表 Claude 官方判定。'
                )}
              </p>
              <a
                href="https://github.com/LinXiaoTao/FuckClaude"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4">
                {t('检测源码：FuckClaude（MIT）')}
              </a>
            </div>
          </details>
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0 self-start text-muted-foreground"
            onClick={() => setOpen(true)}>
            {t('查看检测日志')}
          </Button>
        </div>
        <ResponsiveDialog
          open={open}
          onOpenChange={setOpen}
          title={t('检测日志')}
          description={t('本次检测结果与各项环境信号详情。')}>
          <div
            role="log"
            aria-label={t('检测日志')}
            aria-live="polite"
            className="max-h-72 overflow-auto font-mono text-xs leading-6">
            {SIGNALS.map((definition, i) => {
              const status = outcomeStatus(outcomes[i]);
              return (
                <div
                  key={definition.id}
                  className="flex items-start gap-2 border-b border-border/40 py-1 last:border-0">
                  <span className="shrink-0 text-muted-foreground">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className={`shrink-0 ${STATUS_CLASS[status]}`}>
                    [{STATUS_TEXT[status]()}]
                  </span>
                  <div className="min-w-0 flex-1 break-words">
                    <span>{t(SIGNAL_LABELS[i])}</span>
                    <span className="text-muted-foreground">
                      {' · '}
                      {logDetails[i]}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </ResponsiveDialog>
      </CardContent>
    </Card>
  );
}
