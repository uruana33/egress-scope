import { useState } from 'react';

import { Pending, ToolCard } from '@/components/toolkit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { t } from '@/i18n';

import {
  accessRating,
  averageAccessRating,
  evidenceState,
  qualityRating,
  summarizeAccessScopes,
} from './scenario-evidence';
import { metricLabels } from './scenario-labels';
import { AccessRows, ScenarioSummaryRow } from './scenario-rows';
import { type ScenarioTarget, scenarioGroups } from './scenario-targets';
import { AccessScopeSummary, EvidenceDetails, ScenarioStars, StateBadge } from './scenario-widgets';
import type { useIpLatency } from './use-ip-latency';
import { useScenarioAccess } from './use-scenario-access';
import { useScenarioEvidence } from './use-scenario-evidence';

const platformCount = new Set(
  scenarioGroups.flatMap((group) => group.targets.map((target) => target.url))
).size;

function useGroupSummary(
  ip: string,
  now: number,
  records: ReturnType<typeof useScenarioAccess>['records']
) {
  return (targets: ScenarioTarget[]) =>
    averageAccessRating(
      targets.map((target) => records[target.url]),
      ip,
      now
    );
}

const hasTurnConfig = () =>
  Boolean(
    import.meta.env.VITE_SPEEDTEST_TURN_URI && import.meta.env.VITE_SPEEDTEST_TURN_CREDENTIALS_URL
  );

export function ScenarioPanel({
  ip,
  inbound,
}: {
  ip: string;
  inbound: ReturnType<typeof useIpLatency>;
}) {
  const { records, busy, now, run, cancel } = useScenarioEvidence(ip);
  const access = useScenarioAccess(ip);
  const [selected, setSelected] = useState<string | null>(null);

  const group = scenarioGroups.find((item) => item.id === selected);
  const summary = useGroupSummary(ip, now, access.records);
  const average = group ? summary(group.targets) : null;
  const scopeSummary = summarizeAccessScopes(Object.values(access.records), ip, now);

  const key = group?.inbound ? 'https' : 'quality';
  const evidence = records[key];
  const quality = group?.quality ? qualityRating(evidence, ip, group.quality, now) : null;
  const state = quality?.state ?? evidenceState(evidence, ip, now);
  const hasTurn = hasTurnConfig();
  const blocked = Boolean(busy) || inbound.busy || access.busy;

  const qualityIntro = (
    <>
      <p>
        {t('网站接入评分不代表游戏对战、视频会议或播放质量；完整质量需要带宽、抖动与丢包证据。')}
      </p>
      <p>{t('测试当前浏览器到 Cloudflare 与配置的 TURN 服务，不代表所有目标平台的线路。')}</p>
      <p>{t('最多约 70 MB 测量流量，最长 2 分钟；三个性能场景共用一次结果。')}</p>
      {!hasTurn && (
        <p>{t('未配置 TURN 丢包检测；可测带宽和延迟，但缺少 UDP 证据时不生成星级。')}</p>
      )}
    </>
  );

  const inboundIntro = (
    <>
      <p>{t('上方评分仅代表云平台网站访问，不代表查询 IP 可以部署网站。')}</p>
      <p>
        {t(
          '远端探针检查此 IP 的 HTTPS 443，不使用浏览器出口代替；证书或 Host 不匹配也可能导致失败。'
        )}
      </p>
      <div className="my-2 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={blocked} onClick={() => void inbound.start()}>
          {t('检测 ICMP 入站')}
        </Button>
        {inbound.busy && (
          <Button size="sm" variant="ghost" onClick={inbound.cancel}>
            {t('取消')}
          </Button>
        )}
      </div>
      {inbound.data && (
        <p>
          {t('ICMP 已返回 {0} 个探针；不回包不代表 HTTPS 不可达。', [inbound.data.results.length])}
        </p>
      )}
      {inbound.error && <p className="text-destructive">{inbound.error}</p>}
    </>
  );

  const manual = (
    <>
      <div className="my-2 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={blocked} onClick={() => void run(key)}>
          {group?.inbound ? t('检测 HTTPS 入站') : t('开始网络质量测试')}
        </Button>
        {busy === key && (
          <Button size="sm" variant="ghost" onClick={cancel}>
            {t('取消')}
          </Button>
        )}
        <StateBadge state={state} />
      </div>
      {state === 'mismatch' && <p>{t('观察到的出口与查询 IP 不一致，此结果不能给该 IP 评分。')}</p>}
      {state === 'unverifiable' && (
        <p>{t('无法读取目标响应或确认出口归属，不能判为 IP 不可用。')}</p>
      )}
      {state === 'expired' && <p>{t('旧结果只供查看，请重新检测。')}</p>}
      {!!quality?.missing.length && (
        <p>
          {t('缺少有效证据')}：
          {quality.missing.map((name) => metricLabels[name] ?? name).join('、')}
        </p>
      )}
      {evidence && <EvidenceDetails evidence={evidence} />}
      {quality?.stars != null && (
        <>
          <ScenarioStars stars={quality.stars} />
          <p>{t('AIM 五档对应 1–5 星，仅描述本次浏览器网络测量，不能证明账号或地区可用。')}</p>
        </>
      )}
    </>
  );

  const disclaimer = t(
    '仅检测公开端点响应，不透明响应无法读取 HTTP 状态；不代表登录、对话、播放、地区授权或账号安全。'
  );

  return (
    <ToolCard title={t('应用场景评分')}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="ip-scenario-intro !mb-0">
          {t('自动检测 {0} 类场景、{1} 个平台，点击场景查看详情。', [
            scenarioGroups.length,
            platformCount,
          ])}
        </p>
        <Button
          size="sm"
          variant="secondary"
          disabled={Boolean(busy)}
          onClick={access.busy ? access.cancel : access.start}>
          {access.busy ? <Pending>{t('停止检测')}</Pending> : t('重新测试')}
        </Button>
      </div>
      <AccessScopeSummary summary={scopeSummary} busy={access.busy} />
      <div className="data-table connectivity-table ip-scenario-table">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('应用场景')}</TableHead>
              <TableHead>{t('检测覆盖')}</TableHead>
              <TableHead>{t('浏览器访问参考')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {scenarioGroups.map((item) => {
              const result = summary(item.targets);
              const dots = item.targets
                .map((target) => {
                  const record = access.records[target.url];
                  const rating = accessRating(record, ip, now);
                  if (rating.stars !== null) return String(rating.stars);
                  return !record || record.state === 'running' ? '_' : '!';
                })
                .join(',');
              return (
                <ScenarioSummaryRow
                  key={item.id}
                  group={item}
                  average={result.average}
                  rated={result.rated}
                  dots={dots}
                  busy={access.busy}
                  onSelect={setSelected}
                />
              );
            })}
          </TableBody>
        </Table>
      </div>
      <ResponsiveDialog
        open={!!group}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title={group?.label ?? t('应用场景评分')}
        description={t('当前浏览器公开端点访问参考；点击平台查看采样与出口证据。')}>
        {group && average && (
          <div className="ip-scenario-dialog space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>{t('当前浏览器访问参考')}</span>
              {average.average !== null ? (
                <ScenarioStars stars={average.average} />
              ) : (
                <Badge variant="secondary">{t('证据不足')}</Badge>
              )}
              <p className="w-full text-muted-foreground">
                {t('已评 {0}/{1}，至少 {2} 个平台有效才生成均分；未评分项不计入。', [
                  average.rated,
                  average.total,
                  average.required,
                ])}
              </p>
              {average.rated < average.total && (
                <Badge variant="warning">
                  {access.busy ? <Pending>{t('检测中…')}</Pending> : t('部分结果')}
                </Badge>
              )}
            </div>
            <AccessRows
              key={group.id}
              targets={group.targets}
              records={access.records}
              ip={ip}
              now={now}
            />
            {group.quality && (
              <details>
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  {t('完整网络质量检测')}
                </summary>
                {qualityIntro}
                {manual}
              </details>
            )}
            {group.inbound && (
              <details>
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  {t('查询 IP 入站检测')}
                </summary>
                {inboundIntro}
                {manual}
              </details>
            )}
            <p className="text-muted-foreground">{disclaimer}</p>
          </div>
        )}
      </ResponsiveDialog>
      <details className="mt-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer">{t('评分依据与检测范围')}</summary>
        <p className="mt-2">
          {t('每个平台至少 3 次有效响应；场景至少 3 个平台且覆盖 60% 后取星级均值，保留一位小数。')}
        </p>
        <p>
          {t(
            '按 HTTP 响应耗时中位数评级：≤150 / 300 / 600 / 1000 / >1000 ms 对应 5 / 4 / 3 / 2 / 1 星；这是本站访问速度参考。'
          )}
        </p>
        <p>
          {t(
            '先完成基础采样再补齐至最多 8 次，整轮上限 20 秒。覆盖圆点代表各平台，详情圆点代表单次请求。'
          )}
        </p>
        <p>{disclaimer}</p>
      </details>
    </ToolCard>
  );
}
