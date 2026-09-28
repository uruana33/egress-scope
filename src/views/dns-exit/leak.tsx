import { useEffect } from 'react';

import { t } from '@/i18n';

import DnsExitPage from '.';

export default function DnsLeakRoute() {
  useEffect(() => {
    document.title = t('DNS 泄露与解析出口 · 出口观测台');
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute('content', t('查看实际生效的 DNS 解析出口，对照是否与代理规则一致。'));
  }, []);
  return (
    <div className="space-y-3">
      <header className="page-header">
        <div className="page-header-text">
          <h1>{t('DNS 解析出口和代理规则一致吗？')}</h1>
          <p>{t('查看实际生效的 DNS 解析出口，对照是否与代理规则一致。')}</p>
        </div>
      </header>
      <DnsExitPage />
    </div>
  );
}
