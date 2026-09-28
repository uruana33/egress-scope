import { cn } from 'cn';
import { Globe2 } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export function SiteLogo({
  src,
  website,
  className,
}: {
  src?: string;
  website?: string;
  className?: string;
}) {
  const hostname = website ? new URL(website).hostname : undefined;
  const iconHost =
    hostname === 'api.openai.com'
      ? 'openai.com'
      : hostname === 'chat.deepseek.com'
        ? 'www.deepseek.com'
        : hostname === 'www.githubstatus.com' || hostname === 'githubstatus.com'
          ? 'github.com'
          : hostname;
  const icon = src ?? (iconHost ? `https://icons.duckduckgo.com/ip3/${iconHost}.ico` : undefined);
  const githubIcon = iconHost === 'github.com' || /\/github\.com\.ico(?:[?#]|$)/.test(icon ?? '');
  const proxyHost = icon?.match(/^https:\/\/icons\.duckduckgo\.com\/ip3\/([^/?#]+)\.ico$/)?.[1];
  // Match visible logo sizes: OpenAI's favicon has more built-in whitespace.
  const logoHost = proxyHost ?? iconHost;
  const logoScale =
    logoHost === 'openai.com' || logoHost === 'chatgpt.com'
      ? 1.2
      : logoHost === 'cloudflare.com' || logoHost === 'www.deepseek.com'
        ? 1
        : 0.9;
  const imageSrc = proxyHost
    ? `${import.meta.env.VITE_API_BASE_URL ?? '/api'}/icons/${encodeURIComponent(proxyHost)}`
    : icon;
  return (
    <Avatar className={cn('site-icon rounded-sm after:hidden', className)} aria-hidden="true">
      <AvatarImage
        src={imageSrc}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        style={{ transform: `scale(${logoScale})` }}
        className={`rounded-sm object-contain${githubIcon ? ' dark:brightness-0 dark:invert' : ''}`}
      />
      <AvatarFallback className="rounded-sm">
        <Globe2 className="size-3.5" />
      </AvatarFallback>
    </Avatar>
  );
}
