import { useState } from 'react';

import { ChevronDown, ClipboardCheck, Play, RefreshCw, ShieldCheck } from 'lucide-react';

import { ActionButton, ErrorNotice, Pending } from '@/components/toolkit';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { t } from '@/i18n';
import { maskedIp } from '@/lib/network';

import { useIpGrade } from '../hooks/use-ip-grade';
import {
  type GradeGateStatus,
  type GradeReport,
  type GradeSources,
  gateTone,
  gradeSupports,
  tierCode,
  tierTone,
} from '../model/grade';

function verdictTone(verdict: string): 'good' | 'warn' | 'bad' {
  if (verdict.startsWith('不要拿来开新号')) return 'bad';
  if (verdict.startsWith('还不能当成通过')) return 'warn';
  return 'good';
}

const GATE_STATUS_LABEL: Record<GradeGateStatus, string> = {
  通过: t('通过'),
  不过: t('不过'),
  无法判断: t('无法判断'),
  待核对: t('待核对'),
};

function sourceRows(sources: GradeSources) {
  const rows: { name: string; ok: boolean; fields: [string, string][] }[] = [];
  const yesNo = (value?: string | boolean | null) =>
    value === undefined || value === null || value === ''
      ? t('无数据')
      : value === true || value === 'Yes'
        ? t('是')
        : value === false || value === 'No'
          ? t('否')
          : String(value);
  const v = (value?: string | number | null) =>
    value === undefined || value === null || value === '' ? t('无数据') : String(value);

  const ripe = sources.ripe;
  rows.push({
    name: 'RIPE 路由',
    ok: ripe?.ok === true,
    fields: ripe?.ok
      ? [
          [t('前缀'), v(ripe.prefix)],
          [t('公告 ASN'), ripe.asns?.length ? ripe.asns.join('；') : t('无数据')],
        ]
      : [[t('失败'), v(ripe?.error)]],
  });
  const rdap = sources.rdap;
  rows.push({
    name: 'RDAP 最具体登记',
    ok: rdap?.ok === true,
    fields: rdap?.ok
      ? [
          [t('网络'), `${v(rdap.name)}${rdap.handle ? `（${rdap.handle}）` : ''}`],
          [t('前缀'), v(rdap.prefix)],
          [t('类型'), v(rdap.type)],
          [t('登记人'), v(rdap.registrant)],
        ]
      : [[t('失败'), v(rdap?.error)]],
  });
  const ipinfo = sources.ipinfo;
  rows.push({
    name: 'IPinfo',
    ok: ipinfo?.ok === true,
    fields: ipinfo?.ok
      ? [
          [t('ASN'), `${v(ipinfo.asn)} ${v(ipinfo.asn_name)} / ${v(ipinfo.asn_type)}`],
          [t('公司'), `${v(ipinfo.company)} / ${v(ipinfo.company_type)}`],
          [
            t('位置'),
            [ipinfo.city, ipinfo.region, ipinfo.country].filter(Boolean).join(' ') || t('无数据'),
          ],
          [t('时区'), v(ipinfo.timezone)],
          [t('主机名'), ipinfo.hostname ? String(ipinfo.hostname) : t('无')],
          [
            t('隐私'),
            `${t('代理')} ${yesNo(ipinfo.proxy)}，VPN ${yesNo(ipinfo.vpn)}，Tor ${yesNo(
              ipinfo.tor
            )}，${t('机房')} ${yesNo(ipinfo.hosting)}`,
          ],
        ]
      : [[t('失败'), v(ipinfo?.error)]],
  });
  const ipwho = sources.ipwho;
  rows.push({
    name: 'ipwho.is',
    ok: ipwho?.ok === true,
    fields: ipwho?.ok
      ? [
          [t('ASN'), v(ipwho.asn)],
          [t('组织'), v(ipwho.org)],
          [t('ISP'), v(ipwho.isp)],
          [
            t('位置'),
            [ipwho.city, ipwho.region, ipwho.country].filter(Boolean).join('，') || t('无数据'),
          ],
          [t('时区'), v(ipwho.timezone)],
        ]
      : [[t('失败'), v(ipwho?.error)]],
  });
  const ipquery = sources.ipquery;
  rows.push({
    name: 'ipquery',
    ok: ipquery?.ok === true,
    fields: ipquery?.ok
      ? [
          [t('ASN'), `${v(ipquery.asn)} ${v(ipquery.org)}`],
          [t('ISP'), v(ipquery.isp)],
          [
            t('位置'),
            [ipquery.city, ipquery.region, ipquery.country].filter(Boolean).join('，') ||
              t('无数据'),
          ],
          [
            t('风险'),
            `${t('数据中心')} ${yesNo(ipquery.datacenter)}，VPN ${yesNo(ipquery.vpn)}，${t(
              '代理'
            )} ${yesNo(ipquery.proxy)}，Tor ${yesNo(ipquery.tor)}，${t('分数')} ${v(
              ipquery.risk_score
            )}`,
          ],
        ]
      : [[t('失败'), v(ipquery?.error)]],
  });
  const proxycheck = sources.proxycheck;
  rows.push({
    name: 'proxycheck',
    ok: proxycheck?.ok === true,
    fields: proxycheck?.ok
      ? [
          [t('ASN'), `${v(proxycheck.asn)} ${v(proxycheck.provider)}`],
          [t('组织'), v(proxycheck.organisation)],
          [t('类型'), v(proxycheck.type)],
          [t('代理'), v(proxycheck.proxy)],
          [t('风险'), v(proxycheck.risk)],
          [t('主机名'), proxycheck.hostname ? String(proxycheck.hostname) : t('无')],
          [
            t('位置'),
            [proxycheck.city, proxycheck.region, proxycheck.country].filter(Boolean).join('，') ||
              t('无数据'),
          ],
        ]
      : [[t('失败'), v(proxycheck?.error)]],
  });
  const scam = sources.scamalytics;
  rows.push({
    name: 'Scamalytics',
    ok: scam?.ok === true,
    fields: scam?.ok
      ? [
          [t('欺诈分'), scam.score === undefined ? t('无数据') : `${scam.score} / 100`],
          [t('ISP'), v(scam.isp)],
          [t('组织'), v(scam.org)],
          [t('机房'), yesNo(scam.datacenter)],
          ['VPN', yesNo(scam.vpn)],
          [t('服务器'), yesNo(scam.server)],
          [t('住宅代理'), yesNo(scam.residential_proxy)],
          [t('公共代理'), yesNo(scam.public_proxy)],
        ]
      : [[t('失败'), v(scam?.error)]],
  });
  return rows;
}

function GradeResult({ report, hidden }: { report: GradeReport; hidden: boolean }) {
  const display = (text: string) =>
    hidden ? text.split(report.ip).join(maskedIp(report.ip, true)) : text;
  const tone = verdictTone(report.verdict);
  const code = tierCode(report.tier);
  const tTone = tierTone(report.tier);
  return (
    <div className="ip-grade-result">
      <div className="ip-grade-verdict" data-tone={tone}>
        <ShieldCheck aria-hidden="true" size={18} />
        <div>
          <strong>{display(report.verdict)}</strong>
          <span className="ip-grade-verdict-meta">
            {maskedIp(report.ip, hidden)} ·{' '}
            {t('查询时间 {0}', [new Date(report.fetched_at).toLocaleString()])}
          </span>
        </div>
      </div>

      <div className="ip-grade-tier" data-tone={tTone}>
        <span className="ip-grade-tier-code">{code}</span>
        <div className="ip-grade-tier-copy">
          <strong>{display(report.tier)}</strong>
          <p>{display(report.tier_why)}</p>
          <small>{report.tier_scale}</small>
        </div>
      </div>

      <ol className="ip-grade-gates">
        {report.gates.map((gate, index) => (
          <li key={index} className="ip-grade-gate" data-tone={gateTone(gate.status)}>
            <div className="ip-grade-gate-head">
              <span className="ip-grade-gate-num">{index + 1}</span>
              <strong>{gate.name}</strong>
              <span className="ip-grade-gate-status" data-tone={gateTone(gate.status)}>
                {GATE_STATUS_LABEL[gate.status]}
              </span>
            </div>
            <p className="ip-grade-gate-detail">{display(gate.detail)}</p>
            <details className="ip-grade-gate-expected">
              <summary>
                {t('预期')}
                <ChevronDown size={13} aria-hidden="true" />
              </summary>
              <p>{gate.expected}</p>
            </details>
          </li>
        ))}
      </ol>

      <details className="ip-grade-sources">
        <summary>
          <span>{t('数据源明细')}</span>
          <span className="ip-folio-details-action">
            {t('展开')}
            <ChevronDown size={14} aria-hidden="true" />
          </span>
        </summary>
        <div className="ip-grade-source-grid">
          <dl className="ip-grade-source">
            <dt>{t('反向域名')}</dt>
            <dd>{display(report.rdns)}</dd>
          </dl>
          {sourceRows(report.sources).map((source) => (
            <div key={source.name} className="ip-grade-source" data-ok={source.ok}>
              <h4>
                {source.name}
                {!source.ok ? <em>{t('未取到')}</em> : null}
              </h4>
              <dl>
                {source.fields.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{display(value)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </details>

      <div className="ip-grade-notes">
        <h3>{t('旁证')}</h3>
        <ul>
          {report.side.map((note, index) => (
            <li key={index}>{display(note)}</li>
          ))}
        </ul>
      </div>

      <div className="ip-grade-notes">
        <h3>
          <ClipboardCheck aria-hidden="true" size={14} />
          {t('人工核对清单（工具查不到，需要你自己确认）')}
        </h3>
        <ul>
          {report.checklist.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function GradeBoard({ ip, hidden }: { ip: string; hidden: boolean }) {
  const [run, setRun] = useState<{
    expectState?: string;
    expectTz?: string;
    stableConfirmed?: boolean;
  } | null>(null);
  const [expectState, setExpectState] = useState('');
  const [expectTz, setExpectTz] = useState('');
  const [stable, setStable] = useState(false);
  const query = useIpGrade(ip, run ?? {}, run !== null);

  const start = () =>
    setRun({
      expectState: expectState.trim() || undefined,
      expectTz: expectTz.trim() || undefined,
      stableConfirmed: stable || undefined,
    });

  return (
    <section className="ip-grade" aria-label={t('开号判定')}>
      <div className="ip-grade-head">
        <p className="ip-folio-kicker">{t('开号判定 · 五门')}</p>
        <p className="ip-grade-lede">
          {t('回答「这个地址能不能当作一个账号从注册到使用都不换的出口」。不预测平台会不会封号。')}
        </p>
      </div>

      {!gradeSupports(ip) ? (
        <p className="ip-grade-note">{t('五门判定只覆盖 IPv4 地址。')}</p>
      ) : (
        <>
          <div className="ip-grade-controls">
            <details className="ip-grade-advanced">
              <summary>
                {t('期望位置与人工确认（可选）')}
                <ChevronDown size={13} aria-hidden="true" />
              </summary>
              <div className="ip-grade-options">
                <Label>
                  {t('期望州')}
                  <Input
                    value={expectState}
                    onChange={(event) => setExpectState(event.target.value)}
                    placeholder={t('如 CA 或 California')}
                  />
                </Label>
                <Label>
                  {t('期望时区')}
                  <Input
                    value={expectTz}
                    onChange={(event) => setExpectTz(event.target.value)}
                    placeholder={t('如 America/Los_Angeles')}
                  />
                </Label>
                <Label className="ip-grade-stable">
                  <Switch checked={stable} onCheckedChange={setStable} />
                  <span>{t('我已核对订阅、注册、日常使用的出口是这同一个地址')}</span>
                </Label>
              </div>
            </details>
            <ActionButton busy={query.isFetching} onClick={start}>
              <Play aria-hidden="true" size={14} />
              {query.data ? t('重新判定') : t('跑五门判定')}
            </ActionButton>
            {query.data && !query.isFetching ? (
              <span className="ip-grade-rerun-hint">{t('改动选项后点按钮会按新参数重查')}</span>
            ) : null}
          </div>

          {query.isFetching ? <Pending>{t('判定中，正在读取八路公开源…')}</Pending> : null}
          <ErrorNotice error={query.error} />
          {query.error && !query.isFetching ? (
            <ActionButton variant="outline" onClick={start}>
              <RefreshCw aria-hidden="true" size={14} />
              {t('重试')}
            </ActionButton>
          ) : null}
          {query.data ? <GradeResult report={query.data} hidden={hidden} /> : null}
        </>
      )}
    </section>
  );
}
