import { MapPin, ShieldCheck, SquareActivity } from 'lucide-react';

import { t } from '@/i18n';

import type { Verdict } from '../model/verdict';

const icons = {
  usage: SquareActivity,
  risk: ShieldCheck,
  origin: MapPin,
} as const;

/**
 * The answer, before the evidence. Previously a reader had to scan four cards
 * of raw fields to work out whether an address was a home line, a proxy exit,
 * or native to its country.
 */
export function VerdictRow({ verdicts }: { verdicts: Verdict[] }) {
  return (
    <dl className="ip-verdicts" aria-label={t('结论概览')}>
      {verdicts.map((verdict) => {
        const Icon = icons[verdict.id];
        return (
          <div key={verdict.id} className="ip-verdict" data-tone={verdict.tone}>
            <dt>
              {Icon ? <Icon aria-hidden="true" className="ip-verdict-icon" /> : null}
              {verdict.label}
            </dt>
            <dd>
              <span className="ip-verdict-value">{verdict.value}</span>
              <span className="ip-verdict-hint">{verdict.hint}</span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
