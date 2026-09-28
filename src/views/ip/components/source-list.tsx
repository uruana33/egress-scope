import { CountryFlag } from '@/components/country-flag';
import { t } from '@/i18n';
import type { FolioCardItem, FolioTone } from '@/views/lookup/folio-cards';
import { FolioCards } from '@/views/lookup/folio-cards';

import { type PlaceVote, normCity } from '../model/place';

function placeLine(vote: PlaceVote) {
  if (vote.status === 'outbound') return t('去原站');
  if (vote.status === 'pending') return t('读取中');
  if (vote.status === 'unavailable') return t('未能读取');
  return (
    [vote.city, vote.region, vote.country]
      .filter(Boolean)
      .filter((value, index, all) => all.indexOf(value) === index)
      .join(' · ') || t('无定位')
  );
}

function coordLine(vote: PlaceVote) {
  if (typeof vote.latitude !== 'number' || typeof vote.longitude !== 'number') return undefined;
  return `${vote.latitude.toFixed(4)}, ${vote.longitude.toFixed(4)}`;
}

function voteTone(vote: PlaceVote, majorityCity?: string): FolioTone {
  if (vote.status === 'unavailable') return 'warn';
  if (vote.status !== 'ready' || !vote.city || !majorityCity) return 'neutral';
  return normCity(vote.city) === normCity(majorityCity) ? 'good' : 'warn';
}

/** One card per catalog source so city disagreements read as a spread. */
export function SourceList({
  votes,
  majorityCity,
}: {
  votes: readonly PlaceVote[];
  majorityCity?: string;
}) {
  if (!votes.length) {
    return <p className="ip-folio-note">{t('未获取到归属地数据')}</p>;
  }
  const items: FolioCardItem[] = votes.map((vote) => ({
    key: vote.id,
    label: vote.name,
    value: (
      <span className="ip-folio-card-place">
        <CountryFlag code={vote.country_code} />
        <span>{placeLine(vote)}</span>
      </span>
    ),
    hint: coordLine(vote),
    tone: voteTone(vote, majorityCity),
  }));
  return <FolioCards items={items} />;
}
