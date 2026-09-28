import { useEffect, useState } from 'react';

import { useQuery } from '@tanstack/react-query';

import { AnimatedValue } from '@/components/animated-value';
import { DataTable } from '@/components/data-table';
import { LookupFaq } from '@/components/lookup-faq';
import { ActionButton, ErrorNotice, IpText, Pending } from '@/components/toolkit';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { t } from '@/i18n';

import { runWebRtc } from './api';
import { rtcColumns, rtcRowId } from './columns';

const FAQ_ITEMS = [
  {
    title: t('WebRTC 泄露是怎么回事？'),
    text: t(
      'WebRTC 通过 ICE/STUN 发现可用于点对点连接的地址。STUN 通常使用 UDP，如果代理仅接管 TCP，候选地址可能暴露另一条公网出口。本页只创建数据通道，不申请摄像头或麦克风权限。'
    ),
  },
  {
    title: t('STUN 和 UDP 是什么？'),
    text: t(
      'UDP 是无连接传输协议。STUN 服务器把它观察到的公网映射地址返回给客户端。本工具同时配置 Google 与 Cloudflare STUN，采集 ICE 候选并与 HTTP 出口对照；mDNS 隐藏的本地地址不会被误报为公网 IP。'
    ),
  },
  {
    title: t('如何判断是否泄露了？'),
    text: t(
      '出口不同仅说明 UDP 和 HTTP 路由不同，也可能是预期分流。请核对运营商、地区和代理规则。没有采集到公网地址可能是 UDP 被阻断或浏览器限制，不能据此断言安全。'
    ),
  },
  {
    title: t('发现泄露了，怎么修？'),
    text: t(
      '检查客户端 UDP 转发、TUN 接管和 IPv6 规则。Firefox 可在 about:config 中关闭 media.peerconnection.enabled；Brave 可禁用非代理 UDP。关闭 WebRTC 会影响视频会议等功能，优先修正代理路由。'
    ),
  },
  {
    title: t('为什么代理模式和 TUN 模式检测结果不同？'),
    text: t(
      '系统代理与虚拟网卡模式接管流量的范围不同。STUN 在某些代理模式下可能完全无法发出，在 TUN 模式下则能真实反映 UDP 路由。请同时检测 DNS，不能将单次 WebRTC 结果视为完整隐私审计。'
    ),
  },
];

export default function WebRtcPage() {
  const [round, setRound] = useState(0);
  useEffect(() => {
    document.title = t('WebRTC 泄露检测与出口对照 · 出口观测台');
  }, []);
  const query = useQuery({
    queryKey: ['webrtc-diagnostic', round],
    queryFn: ({ signal }) => runWebRtc(undefined, signal),
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
  const { data } = query;
  const fetching = query.isFetching;

  return (
    <>
      <header className="page-header">
        <div className="page-header-text">
          <h1>{t('UDP 出口和网页出口一致吗？')}</h1>
          <p>
            {t(
              '仅建立数据通道，不申请摄像头与麦克风。检测在浏览器本地可见，不静默上报真实 ISP IP。结果用于核对路由，不单独作为隐私审计结论。'
            )}
          </p>
        </div>
      </header>
      <Card className="mb-3">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm">{t('WebRTC 出口对照')}</CardTitle>
            <ActionButton size="sm" busy={fetching} onClick={() => setRound((n) => n + 1)}>
              {fetching ? t('检测中...') : t('重新检测')}
            </ActionButton>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div role="status">
            <AnimatedValue value={data?.verdict ?? fetching}>
              {fetching ? (
                <Pending>{t('正在采集 ICE 候选地址...')}</Pending>
              ) : (
                (data?.verdict ?? t('未完成检测'))
              )}
            </AnimatedValue>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t('HTTP 基准出口')}</span>
            {data?.baseline ? (
              <IpText ip={data.baseline.ip} />
            ) : fetching ? (
              <Pending>{t('加载中...')}</Pending>
            ) : (
              t('未知')
            )}
            <Badge variant="secondary">
              {data?.results.length ?? 0}
              {t('个地址')}
            </Badge>
            {data?.splitTunnel && <Badge variant="destructive">{t('观测到不同 STUN 地址')}</Badge>}
            {data?.udpBlocked && <Badge variant="outline">{t('UDP 可能被阻断')}</Badge>}
          </div>
        </CardContent>
      </Card>
      <ErrorNotice error={query.error} />
      {Boolean(data?.results.length) && (
        <Card>
          <CardContent>
            <DataTable
              data={data?.results ?? []}
              columns={rtcColumns}
              getRowId={rtcRowId}
              animateChanges={false}
              animateEntries
            />
          </CardContent>
        </Card>
      )}
      <LookupFaq items={FAQ_ITEMS} />
    </>
  );
}
