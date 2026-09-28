import { useEffect, useMemo, useRef, useState } from 'react';

import { useSearchParams } from 'react-router-dom';

import { useMutation, useQuery } from '@tanstack/react-query';

import { LookupForm } from '@/components/lookup-form';
import { NumberTicker } from '@/components/number-ticker';
import { ErrorNotice, Pending } from '@/components/toolkit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { locale, t } from '@/i18n';
import { queryKeys } from '@/lib/query-keys';

import { type PingInput, type PingResponse, getPingNodes, runPing } from './api';
import { PingResults } from './components/ping-results';
import { selectPingPresets } from './presets';
import { PresetRegionDetails, RegionPickerDialog } from './region-picker';

const REGIONS = [
  { id: 'AS', name: t('亚洲') },
  { id: 'EU', name: t('欧洲') },
  { id: 'NA', name: t('北美') },
  { id: 'SA', name: t('南美') },
  { id: 'AF', name: t('非洲') },
  { id: 'OC', name: t('大洋洲') },
];

const scopeButtonClass = (active: boolean) =>
  active
    ? 'bg-primary/15 text-primary border border-primary/30 font-semibold shadow-xs'
    : 'text-muted-foreground hover:text-foreground';

function resultStatusLabel({
  data,
  stopped,
  pending,
  isError,
}: {
  data?: PingResponse;
  stopped: boolean;
  pending: boolean;
  isError: boolean;
}) {
  if (data?.reusedAt) {
    return t('复用 {0} 的测量结果', [new Date(data.reusedAt).toLocaleTimeString(locale)]);
  }
  if (stopped) return t('已停止');
  if (pending) return t('测试中...');
  return isError ? t('部分测量未完成') : t('测量完成');
}

export default function PingPage({
  host: hostProp,
  hideSearch = false,
}: {
  host?: string;
  hideSearch?: boolean;
} = {}) {
  const [params, setParams] = useSearchParams();
  const host = (hostProp ?? params.get('host') ?? '').trim();
  const [scope, setScope] = useState('world');
  const [fullCoverage, setFullCoverage] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [progress, setProgress] = useState<PingResponse>();
  const [stopped, setStopped] = useState(false);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!hideSearch) document.title = t('全球延迟抽样 · 出口观测台');
    return () => controller.current?.abort();
  }, [hideSearch]);

  const catalog = useQuery({
    queryKey: queryKeys.ping.catalog(),
    queryFn: ({ signal }) => getPingNodes(signal),
    staleTime: 300_000,
    retry: false,
  });
  const nodes = useMemo(() => catalog.data ?? [], [catalog.data]);
  const { chinaNodes, availableNodes, presetNodes } = selectPingPresets(nodes, scope, fullCoverage);
  const planned = scope === 'custom' ? selected.length : presetNodes.length;

  const query = useMutation({
    mutationFn: async (input: PingInput) => {
      controller.current?.abort();
      controller.current = new AbortController();
      return runPing(input, controller.current.signal, setProgress);
    },
    retry: false,
  });

  const start = (nextHost = host) => {
    const value = nextHost.trim();
    if (!value) return;
    if (!hideSearch) setParams({ host: value });
    setProgress(undefined);
    setStopped(false);
    query.reset();
    query.mutate({
      host: value,
      preferred: scope !== 'custom' && !fullCoverage,
      nodes: scope === 'custom' ? selected : presetNodes.map((node) => node.id),
    });
  };

  const data = progress ?? query.data;
  const done =
    data?.results.filter((item) => ['finished', 'failed'].includes(item.result.status)).length ?? 0;

  const toggleCoverage = (value: boolean) => () => setFullCoverage(value);

  return (
    <div className={hideSearch ? 'ping-page space-y-3' : 'lookup-page ping-page space-y-3'}>
      {hideSearch ? (
        <div className="lookup-ping-start flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {t('从所选地区测延迟和丢包，不会自动开始。')}
          </p>
          <Button
            size="sm"
            disabled={!host || query.isPending || catalog.isPending || !planned}
            onClick={() => start()}>
            {query.isPending ? t('测量中…') : t('开始测量')}
          </Button>
        </div>
      ) : (
        <div className="lookup-search-card cyber-cockpit-card">
          <LookupForm
            grouped
            value={host}
            placeholder={t('输入 IP 地址或域名')}
            label={t('开始')}
            busy={query.isPending || catalog.isPending}
            onSubmit={(value) => start(value)}
          />
        </div>
      )}
      <Card className="cyber-cockpit-card">
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1">
            {[{ id: 'world', name: t('全球检测') }, ...REGIONS].map((region) => (
              <Button
                key={region.id}
                size="sm"
                variant={scope === region.id ? 'secondary' : 'ghost'}
                className={scopeButtonClass(scope === region.id)}
                disabled={query.isPending}
                onClick={() => setScope(region.id)}>
                {region.name}
              </Button>
            ))}
            <RegionPickerDialog
              nodes={nodes}
              catalogPending={catalog.isPending}
              catalogError={catalog.error}
              selected={selected}
              onSelected={setSelected}
              onApply={() => setScope('custom')}
              active={scope === 'custom'}
              disabled={query.isPending}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {scope === 'custom'
                ? t('已选 {0}/50 个城市', [selected.length])
                : t('{0} · {1} 个探测地区，预计消耗 {2} 次探针额度', [
                    fullCoverage ? t('完整覆盖') : t('优选模式'),
                    planned,
                    planned,
                  ])}
            </span>
            {planned > 50 && (
              <span>
                {t('分')}
                {Math.ceil(planned / 50)}
                {t('批测试')}
              </span>
            )}
          </div>
          {scope !== 'custom' && (
            <>
              <div className="flex items-center gap-2 text-xs">
                <Button
                  size="sm"
                  variant={fullCoverage ? 'ghost' : 'secondary'}
                  disabled={query.isPending}
                  onClick={toggleCoverage(false)}>
                  {t('优选模式')}
                </Button>
                <Button
                  size="sm"
                  variant={fullCoverage ? 'secondary' : 'ghost'}
                  disabled={query.isPending}
                  onClick={toggleCoverage(true)}>
                  {t('完整覆盖（')}
                  {availableNodes.length}
                  {t('个地区）')}
                </Button>
              </div>
              <ErrorNotice error={catalog.error} />
              {catalog.isPending ? (
                <Pending>{t('加载常用方案...')}</Pending>
              ) : (
                <PresetRegionDetails
                  regions={REGIONS}
                  scope={scope}
                  fullCoverage={fullCoverage}
                  presetNodes={presetNodes}
                />
              )}
              <p className="text-xs text-muted-foreground">
                {t(
                  '优选模式优先加入 2 个中国大陆城市用于对照；其他地区优先大型云厂商，缺少时使用在线节点。全球每洲另选最多 2 个、单洲最多 5 个。相同组合 60 秒内复用结果。Ping 失败不能单独判定被墙。'
                )}
                {chinaNodes.length < 2 &&
                  t(' 当前只有 {0} 个中国大陆城市在线。', [chinaNodes.length])}
              </p>
            </>
          )}
          {scope === 'custom' && (
            <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
              {selected.map((id) => (
                <Badge variant="secondary" key={id}>
                  {id}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {!query.isIdle && (
        <>
          <div className="my-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {resultStatusLabel({
                data,
                stopped,
                pending: query.isPending,
                isError: query.isError,
              })}{' '}
              · <NumberTicker value={done} />
              {t('个节点已返回 · 平均延迟从高到低，未返回数值置底')}
            </span>
            {query.isPending && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setStopped(true);
                  controller.current?.abort();
                }}>
                {t('停止检测')}
              </Button>
            )}
          </div>
          {!stopped && <ErrorNotice error={query.error} />}
          <PingResults data={data} pending={query.isPending} />
        </>
      )}
    </div>
  );
}
