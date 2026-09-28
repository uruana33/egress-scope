import type { ReactNode } from 'react';

import type { LookupView } from '@/views/lookup/href';
import PingPanel from '@/views/ping';
import WhoisPanel from '@/views/whois';

import { LookupFailure } from './components/lookup-failure';
import { LookupSkeleton } from './components/lookup-skeleton';
import { SnapshotNotice } from './components/snapshot-notice';
import { IpDetails } from './details';
import { useIpLookup } from './hooks/use-ip-lookup';

export default function IpPanel({
  ip,
  view,
  search,
}: {
  ip: string;
  view?: LookupView;
  search?: ReactNode;
}) {
  const query = useIpLookup(ip);
  const failure = query.failure ? (
    <LookupFailure
      report={query.failure}
      ip={ip}
      busy={query.isFetching}
      onRetry={() => void query.refetch()}
    />
  ) : null;
  const notice = query.showingSnapshot ? <SnapshotNotice savedAt={query.snapshotAt} /> : null;

  if (query.data) {
    return (
      <IpDetails
        data={query.data}
        view={view}
        search={search}
        banner={
          <>
            {failure}
            {notice}
          </>
        }
      />
    );
  }

  return (
    <article className="ip-folio">
      {search ? (
        <header className="ip-folio-mast">
          <div className="ip-folio-query">
            <div className="ip-folio-query-field">{search}</div>
          </div>
          {failure}
        </header>
      ) : (
        failure
      )}
      {query.isFetching ? (
        <LookupSkeleton />
      ) : (
        <>
          <div id="lookup-whois" className="ip-folio-record">
            <WhoisPanel query={ip} compact embedded plain />
          </div>
          {view === 'ping' ? (
            <section id="lookup-ping" className="ip-folio-ping">
              <PingPanel host={ip} hideSearch />
            </section>
          ) : null}
        </>
      )}
    </article>
  );
}
