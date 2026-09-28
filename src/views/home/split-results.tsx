import { useEffect, useRef, useState } from 'react';

import { Link } from 'react-router-dom';

import { useQueries } from '@tanstack/react-query';

import { ActionButton } from '@/components/toolkit';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import { t } from '@/i18n';
import {
  type DiagnosticResult,
  classifyDiagnosticError,
  diagnosticResult,
} from '@/lib/diagnostics';
import { queryKeys } from '@/lib/query-keys';
import type { Geo } from '@/lib/types';
import { EgressFlowBoard } from '@/views/egress/flow-board';
import { useEgressRun } from '@/views/egress/run-state';
import {
  EgressExitDescription,
  EgressExitSheet,
  EgressExitTitle,
  EgressSiteDescription,
  EgressSiteSheet,
  EgressSiteTitle,
} from '@/views/egress/site-sheet';

import { detectSiteResult, getGeo } from './api';
import { type SourceDefinition, sourceRegistry } from './source-registry';
import { SplitExitTiles } from './split-exits';

const allSites = sourceRegistry.map((item) => ({ ...item, name: t(item.name) }));
const allSiteIds = allSites.map((site) => site.id);
const initialSites = allSites
  .filter((site) => site.enabledByDefault && site.execution === 'client-request')
  .slice(0, 8);
const initialSiteIds = new Set(initialSites.map((site) => site.id));

export type SplitRow = SourceDefinition & {
  visible: boolean;
  geo?: Geo;
  diagnostic?: DiagnosticResult;
  pending: boolean;
  geoPending: boolean;
};

type SheetView =
  | { kind: 'site'; site: SplitRow; siblingCount: number }
  | { kind: 'exit'; ip: string; geo?: Geo; sites: SplitRow[] };

function useLazyActivation(enabled: boolean, initial: Set<string>) {
  const container = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<Set<string>>(() => (enabled ? new Set() : initial));
  useEffect(() => {
    const element = container.current;
    if (!enabled || !element) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setActive(new Set(initialSiteIds));
        observer.disconnect();
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [enabled]);
  return { container, active, setActive };
}

export function SplitResults({ summary = false }: { summary?: boolean }) {
  const sites = summary ? initialSites : allSites;
  const [round, setRound] = useEgressRun('split');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailIp, setDetailIp] = useState<string | null>(null);
  const runId = `split-${round}`;
  const {
    container,
    active: visibleSites,
    setActive: setVisibleSites,
  } = useLazyActivation(summary, new Set(allSiteIds));

  const queries = useQueries({
    queries: sites.map((site) => ({
      queryKey: queryKeys.home.split(site.id, round),
      enabled: visibleSites.has(site.id),
      queryFn: ({ signal }: { signal: AbortSignal }) => detectSiteResult(site, runId, signal),
      staleTime: 60_000,
      retry: false,
    })),
  });

  const diagnostics = queries.map((query, index) => {
    if (query.isFetching) return undefined;
    if (!query.isError) return query.data;
    return diagnosticResult(
      {
        runId,
        sourceId: sites[index].id,
        runtime: 'browser',
        execution: 'client-request',
        subject: 'caller-egress',
        provenance: 'observed',
        verified: false,
      },
      classifyDiagnosticError(query.error),
      new Date(query.errorUpdatedAt).toISOString()
    );
  });

  const ips = [
    ...new Set(
      diagnostics.flatMap((result, index) =>
        visibleSites.has(sites[index].id) && result?.status === 'ok' && result.ip ? [result.ip] : []
      )
    ),
  ];
  const geoQueries = useQueries({
    queries: ips.map((ip) => ({
      queryKey: queryKeys.geo.byIp(ip),
      queryFn: ({ signal }: { signal: AbortSignal }) => getGeo(ip, signal),
      staleTime: 60_000,
      retry: false,
    })),
  });
  const geoByIp = new Map(ips.map((ip, index) => [ip, geoQueries[index]]));

  const rows: SplitRow[] = sites.map((site, i) => {
    const diagnostic = diagnostics[i];
    const ip = diagnostic?.status === 'ok' ? diagnostic.ip : undefined;
    const geoQuery = ip ? geoByIp.get(ip) : undefined;
    const geoData = geoQuery?.isFetching || geoQuery?.isError ? undefined : geoQuery?.data;
    const visible = visibleSites.has(site.id);
    return {
      ...site,
      visible,
      diagnostic,
      geo: visible && ip ? { ...geoData, ip, source: geoData?.source ?? site.name } : undefined,
      pending: visible && (queries[i].isFetching || queries[i].isPending),
      geoPending: visible && (queries[i].isPending || Boolean(ip && geoQuery?.isFetching)),
    };
  });
  rows.sort((a, b) => {
    const aBlocked = a.visible && !a.pending && !a.geo;
    const bBlocked = b.visible && !b.pending && !b.geo;
    return Number(bBlocked) - Number(aBlocked);
  });

  const exits = [
    ...new Map(rows.flatMap((row) => (row.geo ? [[row.geo.ip, row.geo] as const] : []))).values(),
  ].map((geo) => ({
    geo,
    count: rows.filter((row) => row.geo?.ip === geo.ip).length,
  }));

  const detail = rows.find((row) => row.id === detailId);
  const exitRows = detailIp ? rows.filter((row) => row.geo?.ip === detailIp) : [];
  const sheet: SheetView | null = detail
    ? {
        kind: 'site',
        site: detail,
        siblingCount: detail.geo?.ip
          ? rows.filter((row) => row.geo?.ip === detail.geo?.ip).length
          : 0,
      }
    : detailIp
      ? { kind: 'exit', ip: detailIp, geo: exitRows[0]?.geo, sites: exitRows }
      : null;
  const heldSheet = useRef<SheetView | null>(sheet);
  if (sheet) heldSheet.current = sheet;
  const view = sheet ?? heldSheet.current;

  const pending = queries.some((q) => q.isFetching);
  const Container = summary ? Card : 'div';
  const Content = summary ? CardContent : 'div';

  const closeSheet = () => {
    setDetailId(null);
    setDetailIp(null);
  };

  return (
    <Container ref={container} className="mb-3">
      {summary && (
        <CardHeader>
          <div className="row-between">
            <CardTitle>{t('网站分流出口')}</CardTitle>
            <Link className="small muted" to="/network/egress">
              {t('查看全部 ›')}
            </Link>
          </div>
        </CardHeader>
      )}
      <Content>
        {!summary && (
          <EgressFlowBoard
            rows={rows}
            total={sites.length}
            pending={pending}
            onSelectIp={setDetailIp}
            onSelectSite={setDetailId}
            action={
              <ActionButton
                busy={pending}
                onClick={() => {
                  closeSheet();
                  setVisibleSites(new Set(allSiteIds));
                  setRound((value) => value + 1);
                }}>
                {pending ? t('检测中...') : t('重新检测')}
              </ActionButton>
            }
          />
        )}
        {summary && (
          <SplitExitTiles
            exits={exits}
            totalSites={sites.length}
            rowsWithGeo={rows.filter((row) => row.geo).length}
            pending={pending}
            onSelectIp={(ip) => {
              setDetailId(null);
              setDetailIp(ip);
            }}
          />
        )}
      </Content>
      <ResponsiveDialog
        className="egress-sheet-dialog"
        open={sheet !== null}
        onOpenChange={(open) => {
          if (!open) closeSheet();
        }}
        title={
          view?.kind === 'site' ? (
            <EgressSiteTitle site={view.site} />
          ) : view?.kind === 'exit' ? (
            <EgressExitTitle ip={view.ip} geo={view.geo} />
          ) : (
            t('出口站点')
          )
        }
        description={
          view?.kind === 'site' ? (
            <EgressSiteDescription site={view.site} />
          ) : view?.kind === 'exit' ? (
            <EgressExitDescription geo={view.geo} count={view.sites.length} />
          ) : null
        }>
        {view?.kind === 'site' ? (
          <EgressSiteSheet
            key={view.site.id}
            site={view.site}
            siblingCount={view.siblingCount}
            onSelectExit={(ip) => {
              setDetailId(null);
              setDetailIp(ip);
            }}
          />
        ) : view?.kind === 'exit' ? (
          <EgressExitSheet
            key={view.ip}
            ip={view.ip}
            sites={view.sites}
            onSelectSite={setDetailId}
          />
        ) : null}
      </ResponsiveDialog>
    </Container>
  );
}
