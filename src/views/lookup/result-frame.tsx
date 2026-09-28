import { type ReactNode } from 'react';

import { t } from '@/i18n';
import PingPanel from '@/views/ping';
import WhoisPanel from '@/views/whois';

import { FolioFold } from './folio-fold';
import type { LookupView } from './href.ts';

export function DomainResult({
  query,
  view,
  search,
}: {
  query: string;
  view?: LookupView;
  search?: ReactNode;
}) {
  return (
    <article className="ip-folio">
      <header className="ip-folio-mast">
        <h1 className="sr-only">{query}</h1>
        <div className="ip-folio-query">
          <div className="ip-folio-query-field">{search}</div>
        </div>
        <div className="ip-folio-head">
          <p className="ip-folio-kicker">{t('谁注册的')}</p>
          <p className="ip-folio-dek">
            {t('注册局记录。这里的国家是登记信息，不能用来判断服务器在哪。')}
          </p>
        </div>
      </header>
      <div id="lookup-whois" className="ip-folio-record">
        <WhoisPanel query={query} embedded plain />
      </div>
      <FolioFold
        id="lookup-ping"
        title={t('各地快不快')}
        hint={t('点开始才会消耗测量额度。')}
        open={view === 'ping'}>
        <PingPanel host={query} hideSearch />
      </FolioFold>
    </article>
  );
}
