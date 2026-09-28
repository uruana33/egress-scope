import { useEffect, useState } from 'react';

import { Link } from 'react-router-dom';

import { ReportPrivacyNote, ShareReportButton } from '@/components/share-report';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { t } from '@/i18n';
import { type ReportSummary, alignmentLabel, loadShareDraft } from '@/lib/share-report';

import '../docs/docs-health.css';

function setShareMeta() {
  document.title = t('分享检测报告 · 出口观测台');
  document
    .querySelector('meta[name="description"]')
    ?.setAttribute('content', t('生成可分享的出口一致性报告链接。'));
}

export default function ShareHubPage() {
  const [summary] = useState<ReportSummary | null>(() => loadShareDraft());
  useEffect(() => {
    setShareMeta();
  }, []);
  return (
    <div className="docs-health space-y-3">
      <header className="page-header">
        <div className="page-header-text">
          <h1>{t('生成可分享的出口一致性报告')}</h1>
          <p>{t('生成可分享的出口一致性报告链接。')}</p>
        </div>
      </header>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t('最近一次本地结果')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {summary ? (
            <>
              <dl className="docs-fields">
                <div>
                  <dt>{t('国内／海外出口')}</dt>
                  <dd>{alignmentLabel(summary.egress_consistent)}</dd>
                </div>
                <div>
                  <dt>{t('质量分')}</dt>
                  <dd>
                    {summary.quality_score == null
                      ? t('未知')
                      : `${summary.quality_score}${summary.quality_status ? `（${summary.quality_status}）` : ''}`}
                  </dd>
                </div>
              </dl>
              <ShareReportButton summary={summary} />
            </>
          ) : (
            <div className="space-y-3">
              <p className="small muted">
                {t('尚未完成本地检测。先在首页跑一轮出口对照，再回到这里生成链接。')}
              </p>
              <Button variant="outline" asChild>
                <Link to="/">{t('去首页检测')}</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      <ReportPrivacyNote />
    </div>
  );
}
