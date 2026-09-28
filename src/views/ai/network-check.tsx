import { type ReactNode } from 'react';

import { Link } from 'react-router-dom';

import { LatencyBadge } from '@/components/latency-badge';
import { SiteLogo } from '@/components/site-logo';
import { ActionButton, IpText, Pending } from '@/components/toolkit';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useSortAnimation } from '@/hooks/use-sort-animation';
import { t } from '@/i18n';

import type { DefaultExitSource } from './default-exit';
import { AI_OVERVIEW_SAMPLE_COUNT, probeCoverage } from './probe';
import { useAiNetworkQueries } from './use-ai-network';

function defaultExitLabel(source: DefaultExitSource | undefined): string {
  if (!source) return t('HTTP 默认出口 · 待确认');
  if (source.id === 'webrtc') return t('UDP 观察出口');
  if (source.id === 'worker') return t('HTTP 默认出口 · 本站接口');
  if (source.id === 'domestic') return t('HTTP 出口 · 国内 CDN');
  return t('HTTP 默认出口 · api.ip.sb');
}

export function AiNetworkCheck({
  domains,
  children,
  sampleCount = AI_OVERVIEW_SAMPLE_COUNT,
}: {
  domains: string[];
  children?: ReactNode;
  sampleCount?: number;
}) {
  const { probeQuery, busy, items, refresh } = useAiNetworkQueries(domains, sampleCount);
  const sortRef = useSortAnimation(items.map(({ domain }) => domain).join('|'));
  return (
    <Card className="ai-network-check">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>{t('网络连通性')}</CardTitle>
          <ActionButton
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0"
            busy={busy}
            onClick={() => void refresh()}>
            {busy ? t('检测中…') : t('重新检测')}
          </ActionButton>
        </div>
      </CardHeader>
      <CardContent>
        <div ref={sortRef}>
          <Table className="ai-connectivity-table">
            <TableHeader>
              <TableRow>
                <TableHead>{t('域名')}</TableHead>
                <TableHead>{t('出口')} IP</TableHead>
                <TableHead className="text-right">{t('延迟')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(({ domain, result, exit, platform, defaultExit }) => {
                const isPlatformExit = Boolean(platform?.traceDomain);
                const egressConfigured = exit.configured;
                const exitKind = isPlatformExit
                  ? t('平台实测出口')
                  : !egressConfigured
                    ? t('未配置平台出口检测')
                    : defaultExit?.verdict === 'split'
                      ? t('观察到分流')
                      : defaultExitLabel(defaultExit?.displaySource);
                const exitTitle = isPlatformExit
                  ? t('通过该平台可读取的 trace 端点测得，反映本次访问该平台端点的出口。')
                  : !egressConfigured
                    ? t('该域名未配置平台出口检测。')
                    : defaultExit?.verdict === 'split'
                      ? t(
                          '不同线路返回不同出口（{0}），存在分流；访问该平台的实际出口可能与显示值不同。',
                          [
                            defaultExit.sources
                              .map((source) => `${source.label}: ${source.ip ?? '—'}`)
                              .join(' · '),
                          ]
                        )
                      : defaultExit?.displaySource?.transport === 'udp'
                        ? t(
                            '仅 WebRTC/STUN 返回公网地址；这是 UDP 观察出口，不等于该 AI 平台的 HTTP 出口。'
                          )
                        : t(
                            '无实测接口的平台显示 HTTP 默认出口来源；分流环境下不代表平台专属出口。'
                          );
                return (
                  <TableRow key={domain} data-sort-id={domain}>
                    <TableCell className="ai-connectivity-site">
                      <span className="flex min-w-0 items-center gap-2">
                        <SiteLogo website={`https://${domain}`} />
                        <span>{domain}</span>
                      </span>
                    </TableCell>
                    <TableCell className="ai-connectivity-exit text-muted-foreground">
                      <span className="ai-exit-kind" title={exitTitle}>
                        {exitKind}
                      </span>
                      {exit.pending ? (
                        <Pending>{t('检测中…')}</Pending>
                      ) : !egressConfigured ? (
                        <span title={t('该 API 域名未配置专属出口检测。')}>{t('未配置')}</span>
                      ) : defaultExit?.verdict === 'split' ? (
                        defaultExit.sources
                          .filter((source) => source.ip)
                          .map((source) => (
                            <div key={source.id} className="text-xs">
                              <span className="muted">{defaultExitLabel(source)}: </span>
                              <IpText ip={source.ip} />
                            </div>
                          ))
                      ) : exit.ip ? (
                        <IpText ip={exit.ip} />
                      ) : isPlatformExit ? (
                        <span title={t('未获取到出口，可能受跨域或连接限制。')}>
                          {t('暂不可用')}
                        </span>
                      ) : (
                        <span title={t('未获取到浏览器出口，可能受跨域或连接限制。')}>
                          {t('检测失败')}
                        </span>
                      )}
                      {exit.stale && exit.updatedAt ? (
                        <span className="text-xs muted">
                          {t('上次出口结果 · {0}', [new Date(exit.updatedAt).toLocaleString()])}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="ai-connectivity-latency text-right">
                      {probeQuery.isPending ? (
                        <Pending>{t('检测中…')}</Pending>
                      ) : result?.median != null ? (
                        <span className="flex flex-col items-end gap-0.5">
                          <span title={result.description}>
                            <LatencyBadge result={result} running={probeQuery.isFetching} />
                          </span>
                          <span className="text-xs muted">
                            {(() => {
                              const coverage = probeCoverage(result);
                              return t('成功 {0}/{1}', [coverage.successful, coverage.total]);
                            })()}
                          </span>
                          {probeQuery.isRefetchError && probeQuery.dataUpdatedAt ? (
                            <span className="text-xs muted">
                              {t('上次结果 · {0}', [
                                new Date(probeQuery.dataUpdatedAt).toLocaleString(),
                              ])}
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span
                          className="text-xs font-medium text-destructive"
                          title={result?.description}>
                          {result?.status === 'restricted' ? t('检测受限') : t('未确认')}
                          {result ? (
                            <span className="block text-xs text-muted-foreground">
                              {t('成功 {0}/{1}', [
                                probeCoverage(result).successful,
                                probeCoverage(result).total,
                              ])}
                            </span>
                          ) : null}
                        </span>
                      )}
                      {probeQuery.isRefetchError &&
                      result?.median == null &&
                      probeQuery.dataUpdatedAt ? (
                        <span className="text-xs muted">
                          {t('上次结果 · {0}', [
                            new Date(probeQuery.dataUpdatedAt).toLocaleString(),
                          ])}
                        </span>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <p className="small muted mt-2">
          {t('检测的是站点资源响应，不等于登录或对话可用；跨站限制和超时不会判为“未连通”。')}
        </p>
        <p className="small muted">
          {t(
            '无实测接口的平台会标注 HTTP 默认出口、UDP 观察出口或分流；这些结果说明探测来源看到的地址，不等于平台专属出口。'
          )}
        </p>
        <p className="ai-network-privacy small muted">
          <span>
            {t(
              '本页会从当前浏览器直接请求目标站点、出口回显服务和部分 WebRTC/STUN 服务；这些第三方请求可能看到你的出口 IP，且不会发送账号凭据。'
            )}
          </span>{' '}
          <Link to="/privacy">{t('查看数据来源与隐私说明')}</Link>
        </p>
        {probeQuery.error && (
          <p className="small text-destructive">{t('网络检测失败，请重试。')}</p>
        )}
        {children}
      </CardContent>
    </Card>
  );
}
