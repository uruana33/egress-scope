import { HttpError, json, target } from './http.js';

const ICON_TYPES = new Set([
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]);

// DuckDuckGo has the best coverage but is unreachable from some networks;
// the site's own favicon, Google's favicon service and favicon.im act as
// fallbacks. The first source that returns a valid image wins. Timeouts
// are per source: slow aggregators get a larger budget, but a blocked or
// hanging source can no longer stall the whole request.
function iconSources(domain) {
  return [
    { url: `https://icons.duckduckgo.com/ip3/${domain}.ico`, timeout: 2500 },
    { url: `https://${domain}/favicon.ico`, timeout: 3000 },
    {
      url: `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
      timeout: 3500,
    },
    { url: `https://favicon.im/${domain}?larger=true`, timeout: 7000 },
  ];
}

async function fetchIcon({ url, timeout }) {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(timeout),
    headers: {
      // Several icon hosts and aggregators bot-block the default Workers
      // user agent; present an ordinary browser agent instead.
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      Accept: 'image/avif,image/webp,image/png,image/svg+xml,image/*,*/*;q=0.8',
    },
    cf: {
      cacheEverything: true,
      cacheTtlByStatus: { '200-299': 604800, '400-599': -1 },
    },
  });
  const type = response.headers.get('Content-Type')?.split(';')[0].trim();
  if (!response.ok || !ICON_TYPES.has(type)) {
    await response.body?.cancel();
    throw new HttpError(502, '图标暂不可用');
  }
  return { body: response.body, type };
}

export async function siteIcon(host) {
  const domain = target(host);
  const sources =
    domain === 'weixin.qq.com'
      ? [
          {
            url: 'https://res.wx.qq.com/a/wx_fed/assets/res/NTI4MWU5.ico',
            timeout: 4500,
          },
        ]
      : iconSources(domain);
  try {
    const icon = await Promise.any(sources.map((source) => fetchIcon(source)));
    return new Response(icon.body, {
      headers: {
        'Content-Type': icon.type,
        'Cache-Control': 'public, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    // Domains without any reachable icon fail fast and are negatively cached
    // so repeated page views do not pay the full timeout again.
    return json({ error: '图标暂不可用' }, 502, {
      'Cache-Control': 'public, max-age=300',
    });
  }
}
