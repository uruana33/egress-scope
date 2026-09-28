import { useEffect, useState } from 'react';

import { Link, useParams } from 'react-router-dom';

import { useQuery } from '@tanstack/react-query';

import { CopyButton } from '@/components/copy-button';
import { CopyShareTextButton, ReportPrivacyNote } from '@/components/share-report';
import { IpText, Pending } from '@/components/toolkit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { t } from '@/i18n';
import { endpoint } from '@/lib/network';
import {
  type ReportFlags,
  type ShareReport,
  alignmentLabel,
  reportDocumentTitle,
  reportMarkdown,
  reportShareText,
} from '@/lib/share-report';

import '../docs/docs-health.css';

const FLAG_LABELS: Record<keyof ReportFlags, string> = {
  residential: t('住宅'),
  datacenter: t('机房'),
  mobile: t('移动网络'),
  vpn: 'VPN',
  proxy: t('代理'),
  tor: 'Tor',
  crawler: t('爬虫'),
  abuser: t('滥用'),
};

function readInjected(id: string): ShareReport | undefined {
  const node = document.getElementById('share-report');
  if (!node?.textContent) return undefined;
  try {
    const data = JSON.parse(node.textContent) as ShareReport;
    if (data?.id !== id || !data.summary) return undefined;
    return data;
  } catch {
    return undefined;
  }
}

export default function ShareReportPage() {
  const { id = '' } = useParams();
  const injected = readInjected(id);
  const query = useQuery({
    queryKey: ['share-report', id],
    queryFn: ({ signal }) => endpoint<ShareReport>(`/report/${encodeURIComponent(id)}`, { signal }),
    retry: false,
    refetchOnWindowFocus: false,
    ...(injected ? { initialData: injected, staleTime: Infinity } : { staleTime: 0 }),
  });
  const report = query.data;
  useEffect(() => {
    document.title = report
      ? reportDocumentTitle(report.summary)
      : t('报告不存在或已过期 · 出口观测台');
  }, [report]);
  const markdown = report ? reportMarkdown(report) : '';
  const shareText = report ? reportShareText(report) : '';
  const trueFlags = report?.summary.flags
    ? (Object.entries(report.summary.flags) as [keyof ReportFlags, boolean][])
        .filter(([, value]) => value)
        .map(([key]) => FLAG_LABELS[key])
    : [];
  return (
    <div className="docs-health space-y-3">
      <header className="page-header">
        <div className="page-header-text">
          <h1>
            {report ? alignmentLabel(report.summary.egress_consistent) : t('报告不存在或已过期')}
          </h1>
          <p>
            {report
              ? t('国内出口与海外出口的这一次摘要对照。')
              : t('该分享链接不存在，或已超过保存期限。')}
          </p>
        </div>
      </header>
      {query.isPending ? <Pending>{t('正在加载报告…')}</Pending> : null}
      {query.isError ? (
        <p className="small muted">
          {query.error instanceof Error ? query.error.message : t('报告不存在或已过期')}
        </p>
      ) : null}
      {report ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t('出口对照')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <dl className="docs-fields">
                <div>
                  <dt>{t('国内出口')}</dt>
                  <dd>
                    <IpText ip={report.summary.domestic_ip ?? undefined} />
                  </dd>
                </div>
                <div>
                  <dt>{t('海外出口')}</dt>
                  <dd>
                    <IpText ip={report.summary.overseas_ip ?? undefined} />
                  </dd>
                </div>
                <div>
                  <dt>WebRTC vs HTTP</dt>
                  <dd>{alignmentLabel(report.summary.webrtc_match_http)}</dd>
                </div>
                <div>
                  <dt>DNS vs HTTP</dt>
                  <dd>{alignmentLabel(report.summary.dns_match_http)}</dd>
                </div>
                <div>
                  <dt>{t('质量分')}</dt>
                  <dd>
                    {report.summary.quality_score == null
                      ? t('未知')
                      : `${report.summary.quality_score}${report.summary.quality_status ? `（${report.summary.quality_status}）` : ''}`}
                    {report.summary.asn != null ? ` · ASN ${report.summary.asn}` : ''}
                    {report.summary.isp ? ` · ${report.summary.isp}` : ''}
                  </dd>
                </div>
              </dl>
              <div className="flex flex-wrap gap-2">
                {trueFlags.length ? (
                  trueFlags.map((label) => (
                    <Badge key={label} variant="secondary">
                      {label}
                    </Badge>
                  ))
                ) : (
                  <span className="small muted">{t('无特征标记')}</span>
                )}
              </div>
              {report.notes ? <p className="small muted">{report.notes}</p> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t('复制 Markdown')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <figure className="docs-code">
                <figcaption>
                  <span>{t('分享文案')}</span>
                  <CopyButton value={shareText} />
                </figcaption>
                <pre>
                  <code>{shareText}</code>
                </pre>
              </figure>
              <figure className="docs-code">
                <figcaption>
                  <span>Markdown</span>
                  <CopyButton value={markdown} />
                </figcaption>
                <pre>
                  <code>{markdown}</code>
                </pre>
              </figure>
              <div className="flex flex-wrap items-center gap-2">
                <CopyShareTextButton value={shareText} />
                <CopyTextButton value={report.url} label={t('复制链接')} />
                <CopyTextButton value={markdown} label={t('复制 Markdown')} />
                <Button variant="outline" asChild>
                  <a
                    href={`https://t.me/share/url?url=${encodeURIComponent(report.url)}&text=${encodeURIComponent(markdown)}`}
                    target="_blank"
                    rel="noreferrer">
                    {t('分享到 Telegram')}
                  </a>
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/">{t('再测一次')}</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      ) : query.isPending ? null : (
        <Button variant="outline" asChild>
          <Link to="/">{t('返回首页')}</Link>
        </Button>
      )}
      <ReportPrivacyNote />
    </div>
  );
}

function CopyTextButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}>
      {copied ? t('已复制') : label}
    </Button>
  );
}
