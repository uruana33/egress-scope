import { useCallback, useEffect, useRef, useState } from 'react';

import { t } from '@/i18n';

import { type PingNode, type PingResponse, getPingNodes, runPing } from '../ping/api';
import { latencyCountries, selectLatencyNodes } from './latency-presets';
import { sameIp } from './scenario-evidence';

const emptySlots = () => latencyCountries.map((cc) => ({ cc }));

export function useIpLatency(ip: string) {
  const [busy, setBusy] = useState(false);
  const [nodes, setNodes] = useState<{ cc: string; node?: PingNode }[]>(emptySlots);
  const [data, setData] = useState<PingResponse>();
  const [error, setError] = useState('');
  const [started, setStarted] = useState(false);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const controller = useRef<AbortController | null>(null);

  const names: Record<string, string> = {
    us: t('美国'),
    de: t('德国'),
    gb: t('英国'),
    fr: t('法国'),
    jp: t('日本'),
    ca: t('加拿大'),
    cn: t('中国'),
    kr: t('韩国'),
  };

  const start = useCallback(async () => {
    controller.current?.abort();
    const control = new AbortController();
    controller.current = control;
    setBusy(true);
    setStarted(true);
    setCatalogLoaded(false);
    setError('');
    setData(undefined);
    setNodes(emptySlots());

    try {
      const selected = selectLatencyNodes(await getPingNodes(control.signal));
      if (control.signal.aborted) return;
      setNodes(selected);
      setCatalogLoaded(true);

      const nodeIds = selected.flatMap((item) => (item.node ? [item.node.id] : []));
      if (!nodeIds.length) throw new Error(t('暂无可用优选探针'));

      await runPing({ host: ip, nodes: nodeIds, preferred: true }, control.signal, (result) => {
        if (!control.signal.aborted) setData(result);
      });
    } catch (err) {
      if (!control.signal.aborted) {
        setError(err instanceof Error ? err.message : t('查询失败'));
      }
    } finally {
      if (!control.signal.aborted) setBusy(false);
    }
  }, [ip]);

  useEffect(() => () => controller.current?.abort(), []);

  const cancel = () => {
    controller.current?.abort();
    setBusy(false);
    setError(t('已取消'));
  };

  return {
    ip,
    busy,
    nodes,
    data: data && sameIp(data.target, ip) ? data : undefined,
    error,
    started,
    catalogLoaded,
    names,
    start,
    cancel,
  };
}
