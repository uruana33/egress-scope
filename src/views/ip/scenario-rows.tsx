import { Fragment, memo, useState } from 'react';

import {
  Bitcoin,
  BrainCircuit,
  Briefcase,
  Cloud,
  Code2,
  Gamepad2,
  House,
  Mail,
  MessagesSquare,
  Play,
  Search,
  ShoppingBag,
} from 'lucide-react';

import { LatencyBadge } from '@/components/latency-badge';
import { SiteLogo } from '@/components/site-logo';
import { Pending } from '@/components/toolkit';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { t } from '@/i18n';

import { type Evidence, accessRating } from './scenario-evidence';
import type { ScenarioGroup, ScenarioTarget } from './scenario-targets';
import { EvidenceDetails, PartialNote, ScenarioStars } from './scenario-widgets';

const GOOD = ['readable', 'opaque'];
const BLOCKING = ['failed', 'rate-limited', 'cancelled'];

function dotClass(sample?: Evidence['samples'][number]) {
  if (!sample) return 'ping-dot ';
  if (!GOOD.includes(sample.outcome)) return 'ping-dot dot-fail';
  if (sample.elapsedMs < 100) return 'ping-dot dot-good';
  if (sample.elapsedMs < 400) return 'ping-dot dot-warn';
  return 'ping-dot dot-slow';
}

function dotTitle(sample: Evidence['samples'][number] | undefined, good: boolean) {
  if (!sample) return t('未采样');
  if (good)
    return `${sample.elapsedMs} ms · ${sample.status ? `HTTP ${sample.status}` : t('不透明响应')}`;
  return sample.status ? `HTTP ${sample.status}` : t('检测受阻');
}

function rowStatus(
  evidence: Evidence | undefined,
  rating: ReturnType<typeof accessRating>,
  running: boolean
) {
  if (rating.stale) return t('结果已过期');
  if (evidence?.state === 'cancelled') return t('已取消');
  if (evidence?.state === 'rate-limited') return t('检测限流');
  if (evidence?.state === 'failed') return t('请求被拒绝');
  if (rating.responses) return rating.fluctuating ? t('本轮有波动') : t('已取得响应');
  if (running) return t('检测中…');
  return evidence?.samples.some((sample) => sample.error === 'network')
    ? t('检测受阻')
    : t('检测超时');
}

function ExpandedEvidence({
  evidence,
  rating,
  status,
}: {
  evidence: Evidence | undefined;
  rating: ReturnType<typeof accessRating>;
  status: string;
}) {
  return (
    <TableRow className="ip-platform-evidence">
      <TableCell colSpan={3}>
        <div className="flex flex-wrap items-center gap-2">
          <span>
            {rating.scope === 'ip'
              ? t('该 IP 实测')
              : rating.scope === 'different'
                ? t('出口不同')
                : t('当前网络实测')}
          </span>
          <span>{status}</span>
          {rating.stars !== null && <ScenarioStars stars={rating.stars} />}
        </div>
        {rating.scope === 'different' && (
          <p>{t('出口与查询 IP 不一致，星级仅描述当前网络访问表现。')}</p>
        )}
        {evidence && <EvidenceDetails evidence={evidence} />}
      </TableCell>
    </TableRow>
  );
}

export function AccessRows({
  targets,
  records,
  ip,
  now,
}: {
  targets: ScenarioTarget[];
  records: Record<string, Evidence>;
  ip: string;
  now: number;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <div className="data-table connectivity-table ip-platform-table">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('网站')}</TableHead>
            <TableHead>{t('测试记录')}</TableHead>
            <TableHead>{t('延迟')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {targets.map((target, index) => {
            const evidence = records[target.url];
            const rating = accessRating(evidence, ip, now);
            const running = !evidence || evidence.state === 'running';
            const status = rowStatus(evidence, rating, running);
            const open = expanded === target.url;
            const toggle = () => setExpanded(open ? null : target.url);
            const showLatency =
              rating.median !== null && !rating.stale && !BLOCKING.includes(evidence?.state ?? '');
            return (
              <Fragment key={target.url}>
                <TableRow data-alt={index % 2} className="ip-platform-row" onClick={toggle}>
                  <TableCell>
                    <button
                      type="button"
                      className="site-cell ip-platform-name"
                      aria-expanded={open}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggle();
                      }}>
                      <SiteLogo src={target.icon} website={target.website ?? target.url} />
                      <span>{target.name}</span>
                    </button>
                  </TableCell>
                  <TableCell>
                    <div
                      className="ping-dots"
                      aria-label={t('取得响应 {0}/{1}', [rating.responses, rating.total])}>
                      {Array.from({ length: 8 }, (_, sampleIndex) => {
                        const sample = evidence?.samples[sampleIndex];
                        return (
                          <span
                            key={sampleIndex}
                            className={dotClass(sample)}
                            title={dotTitle(sample, !!sample && GOOD.includes(sample.outcome))}
                          />
                        );
                      })}
                    </div>
                  </TableCell>
                  <TableCell>
                    {showLatency ? (
                      <LatencyBadge
                        result={{
                          median: rating.median,
                          samples: evidence!.samples.map((sample) =>
                            GOOD.includes(sample.outcome) ? sample.elapsedMs : -1
                          ),
                        }}
                        running={running}
                      />
                    ) : (
                      <Badge variant={running ? 'secondary' : 'warning'}>
                        {running ? <Pending>{status}</Pending> : status}
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
                {open && <ExpandedEvidence evidence={evidence} rating={rating} status={status} />}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

const scenarioIcons = {
  ai: BrainCircuit,
  commerce: ShoppingBag,
  social: MessagesSquare,
  crypto: Bitcoin,
  streaming: Play,
  gaming: Gamepad2,
  remote: Briefcase,
  api: Code2,
  hosting: Cloud,
  search: Search,
  domestic: House,
  communication: Mail,
};

// Only visible rating/coverage changes rerender a row; raw sample updates stay in the dialog.
export const ScenarioSummaryRow = memo(function ScenarioSummaryRow({
  group,
  average,
  rated,
  dots,
  busy,
  onSelect,
}: {
  group: ScenarioGroup;
  average: number | null;
  rated: number;
  dots: string;
  busy: boolean;
  onSelect: (id: string) => void;
}) {
  const Icon = scenarioIcons[group.id as keyof typeof scenarioIcons];
  const states = dots.split(',');
  const partial = average !== null && rated < group.targets.length;

  const dotFor = (target: ScenarioTarget, index: number) => {
    const state = states[index];
    const cls = state === '_' ? '' : state === '!' ? 'dot-fail' : 'dot-good';
    const hint = state === '_' ? t('检测中…') : state === '!' ? t('证据不足') : `${state}/5`;
    return (
      <span key={target.url} className={`ping-dot ${cls}`} title={`${target.name} · ${hint}`} />
    );
  };

  return (
    <TableRow className="ip-scenario-table-row" onClick={() => onSelect(group.id)}>
      <TableCell>
        <button
          type="button"
          className="site-cell ip-platform-name"
          aria-haspopup="dialog"
          onClick={(event) => {
            event.stopPropagation();
            onSelect(group.id);
          }}>
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          <span>{group.label}</span>
        </button>
      </TableCell>
      <TableCell>
        <div className="ip-scenario-progress">
          <div className="ping-dots" aria-label={t('已评 {0}/{1}', [rated, group.targets.length])}>
            {group.targets.map(dotFor)}
          </div>
          <span className="ip-scenario-count text-[10px] text-muted-foreground">
            {rated}/{group.targets.length}
          </span>
          <PartialNote visible={partial} />
        </div>
      </TableCell>
      <TableCell>
        <div className="ip-scenario-rating">
          {average !== null ? (
            <ScenarioStars stars={average} />
          ) : (
            <Badge variant="secondary">
              {busy ? <Pending>{t('检测中…')}</Pending> : t('证据不足')}
            </Badge>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
});
