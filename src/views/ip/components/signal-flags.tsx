import { t } from '@/i18n';

import type { CoffeeIp } from '../coffee';
import { proxyFlags } from '../model/flags';

export function SignalFlags({ d }: { d: CoffeeIp }) {
  const flags = proxyFlags(d);
  if (!flags.some((flag) => flag.known)) return null;
  return (
    <ul className="ip-folio-flags" aria-label={t('代理特征')}>
      {flags.map((flag) => (
        <li key={flag.id} data-hit={flag.hit ? 'true' : 'false'}>
          {flag.label}
        </li>
      ))}
    </ul>
  );
}
