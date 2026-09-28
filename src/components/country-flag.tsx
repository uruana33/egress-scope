import { Globe2 } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { t } from '@/i18n';

const FLAG_CDN = 'https://flagcdn.com/w40';
const CODE_RE = /^[a-z]{2}$/i;

export function CountryFlag({ code }: { code?: string }) {
  const country = code && CODE_RE.test(code) ? code.toLowerCase() : undefined;
  const label = country?.toUpperCase() ?? t('未知地区');

  return (
    <Avatar className="country-flag rounded-sm after:hidden" aria-label={label}>
      <AvatarImage
        src={country ? `${FLAG_CDN}/${country}.png` : undefined}
        alt={country ? label : ''}
        className="rounded-none object-contain"
        referrerPolicy="no-referrer"
      />
      <AvatarFallback className="rounded-none bg-transparent">
        <Globe2 className="size-3.5 text-muted-foreground" />
      </AvatarFallback>
    </Avatar>
  );
}
