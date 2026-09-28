const SITE_NAME = '出口观测台';
const OG_IMAGE_ALT = '出口观测台：国内／海外出口对照与 IP 质量';

const META = {
  '/': {
    title: '出口IP检测 / WebRTC / DNS / IP质量 · 出口观测台',
    description:
      '对照国内与海外出口是否按规则走，检查 WebRTC／DNS 泄露，查看 IP 质量分与机房／代理标记。',
    h1: '出口有没有按规则走？',
  },
  '/network/egress': {
    title: '分流出口检测 · 网站／DNS／CDN · 出口观测台',
    description:
      '按网站、DNS、CDN 来源查看实际出口，核对分流规则是否按预期生效。不同地址不直接证明规则完美，但足以定位分流问题。',
    h1: '规则有没有真正生效？',
  },
  '/network/ip': {
    title: 'IP 质量与归属 · 出口观测台',
    description:
      '查看 IP 归属、ASN、质量分与机房／代理／VPN 等特征标记；用于判断出口画像，不代表任何平台官方判定。',
    h1: '查这个出口的画像',
  },
  '/webrtc': {
    title: 'WebRTC 泄露检测与出口对照 · 出口观测台',
    description:
      '对照 HTTP 出口与 WebRTC／STUN 的 UDP 候选，排查代理或 TUN 下的 UDP 分流差异。检测在浏览器本地可见，不静默上报真实 ISP IP。只建数据通道，不申请摄像头麦克风。',
    h1: 'UDP 出口和网页出口一致吗？',
  },
  '/dns': {
    title: 'DNS 泄露与解析出口 · 出口观测台',
    description: '查看实际生效的 DNS 解析出口，对照是否与代理规则一致。',
    h1: 'DNS 解析出口和代理规则一致吗？',
  },
  '/share': {
    title: '分享检测报告 · 出口观测台',
    description: '生成可分享的出口一致性报告链接。',
    h1: '生成可分享的出口一致性报告',
  },
  '/ai/': {
    title: 'AI 平台出口与状态 · 出口观测台',
    description:
      '检测 ChatGPT、Claude、DeepSeek、通义等平台的连通、出口与官方状态。公开端点可响应不等于可登录或可对话。',
    h1: '模型站通不通、从哪出去',
  },
  '/status/': {
    title: 'AI 与云服务官方状态 · 出口观测台',
    description:
      '聚合 OpenAI、Claude、云厂商等公开状态，便于和出口问题交叉排查：是你的网络，还是服务挂了。',
    h1: '是你的网络，还是服务状态异常？',
  },
  '/docs/health': {
    title: 'IP 健康报告 API · 出口观测台',
    description:
      '一行 curl 获取 IP 质量分与机房／代理特征标记，方便换节点后对比。参考值，不代表平台官方判定。',
    h1: '一行 curl，查看出口画像',
  },
  '/docs/egress-ip': {
    title: '出口 IP 检测 · 国内／海外对照 · 出口观测台',
    description:
      '看当前流量从哪条公网 IP 出去，国内和海外是否同一条，以及质量分和机房／代理标记。用于排查分流，不代表平台过审。',
    h1: '出口 IP 检测看哪几项',
  },
  '/docs/dns-leak': {
    title: 'DNS 泄露检测 · 解析出口 · 出口观测台',
    description:
      'DNS 泄露是解析请求没走预期出口。说明它和网页出口、WebRTC 的差别，以及本站 DNS 出口页怎么看。',
    h1: 'DNS 泄露是解析走了另一条出口',
  },
  '/docs/clash': {
    title: 'Clash 健康检查 · 节点出口质量 · 出口观测台',
    description:
      '用出口观测台看 Clash 节点的公网出口和质量分。不读取本地配置，也不代替客户端自带的连通性探测。',
    h1: 'Clash 节点健康，先看出口再看分数',
  },
  '/whois': {
    title: 'WHOIS／RDAP 查询 · 出口观测台',
    description: '查询域名与 IP 注册信息，辅助核对出口归属。',
    h1: '域名与 IP 注册信息',
  },
  '/ping': {
    title: '全球延迟抽样 · 出口观测台',
    description: '多地探针延迟抽样，用来感受这个出口在各地快不快。参考值，不是业务可用性保证。',
    h1: '这个出口在各地快不快',
  },
};

const SITEMAP_ENTRIES = [
  ['/', 'daily', '1.0'],
  ['/network/egress', 'weekly', '0.9'],
  ['/network/ip', 'weekly', '0.9'],
  ['/webrtc', 'weekly', '0.8'],
  ['/dns', 'weekly', '0.8'],
  ['/share', 'weekly', '0.5'],
  ['/ai/', 'daily', '0.8'],
  ['/status/', 'hourly', '0.6'],
  ['/docs/health', 'monthly', '0.7'],
  ['/docs/egress-ip', 'monthly', '0.7'],
  ['/docs/dns-leak', 'monthly', '0.7'],
  ['/docs/clash', 'monthly', '0.7'],
  ['/whois', 'monthly', '0.4'],
  ['/ping', 'monthly', '0.4'],
];

function robotsTxt(origin) {
  return `User-agent: *
Allow: /

Disallow: /api/
Disallow: /cdn-cgi/

Sitemap: ${origin}/sitemap.xml
`;
}

function sitemapXml(origin) {
  const urls = SITEMAP_ENTRIES.map(
    ([path, changefreq, priority]) =>
      `  <url>\n    <loc>${origin}${path}</loc>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`
  ).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function escapeAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function escapeJson(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

function pathMeta(pathname) {
  if (META[pathname]) return pathname;
  if (pathname.startsWith('/network/ip/')) return '/network/ip';
  if (pathname.startsWith('/ai/')) return '/ai/';
  if (pathname.startsWith('/status/')) return '/status/';
  return null;
}

function routeUrl(origin, pathname) {
  return pathname === '/' ? `${origin}/` : `${origin}${pathname}`;
}

function replaceMeta(html, pattern, tag) {
  return pattern.test(html) ? html.replace(pattern, tag) : html;
}

export function applyDocumentMeta(html, meta) {
  const title = escapeAttribute(meta.title);
  const ogTitle = escapeAttribute(meta.ogTitle ?? meta.title);
  const description = escapeAttribute(meta.description);
  const canonical = escapeAttribute(meta.canonical);
  const image = escapeAttribute(meta.image ?? `${meta.origin ?? ''}/og.png`);
  const imageAlt = escapeAttribute(meta.imageAlt ?? OG_IMAGE_ALT);
  let output = html;
  output = replaceMeta(output, /<title>[^<]*<\/title>/i, `<title>${title}</title>`);
  output = replaceMeta(
    output,
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?\s*>/i,
    `<meta name="description" content="${description}" />`
  );
  output = replaceMeta(
    output,
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?\s*>/i,
    `<meta property="og:title" content="${ogTitle}" />`
  );
  output = replaceMeta(
    output,
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?\s*>/i,
    `<meta property="og:description" content="${description}" />`
  );
  output = replaceMeta(
    output,
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?\s*>/i,
    `<meta name="twitter:title" content="${ogTitle}" />`
  );
  output = replaceMeta(
    output,
    /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?\s*>/i,
    `<meta name="twitter:description" content="${description}" />`
  );
  output = replaceMeta(
    output,
    /<meta\s+name="twitter:card"\s+content="[^"]*"\s*\/?\s*>/i,
    `<meta name="twitter:card" content="summary_large_image" />`
  );
  output = replaceMeta(
    output,
    /<meta\s+property="og:image"\s+content="[^"]*"\s*\/?\s*>/i,
    `<meta property="og:image" content="${image}" />`
  );
  output = replaceMeta(
    output,
    /<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?\s*>/i,
    `<meta name="twitter:image" content="${image}" />`
  );
  output = replaceMeta(
    output,
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?\s*>/i,
    `<link rel="canonical" href="${canonical}" />`
  );
  output = replaceMeta(
    output,
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?\s*>/i,
    `<meta property="og:url" content="${canonical}" />`
  );
  if (meta.robots) {
    output = replaceMeta(
      output,
      /<meta\s+name="robots"\s+content="[^"]*"\s*\/?\s*>/i,
      `<meta name="robots" content="${escapeAttribute(meta.robots)}" />`
    );
  }

  const extra = [];
  if (!/<title[\s>]/i.test(output)) extra.push(`<title>${title}</title>`);
  if (!/name="description"/i.test(output))
    extra.push(`<meta name="description" content="${description}" />`);
  if (!/property="og:title"/i.test(output))
    extra.push(`<meta property="og:title" content="${ogTitle}" />`);
  if (!/property="og:description"/i.test(output))
    extra.push(`<meta property="og:description" content="${description}" />`);
  if (!/name="twitter:card"/i.test(output))
    extra.push(`<meta name="twitter:card" content="summary_large_image" />`);
  if (!/name="twitter:title"/i.test(output))
    extra.push(`<meta name="twitter:title" content="${ogTitle}" />`);
  if (!/name="twitter:description"/i.test(output))
    extra.push(`<meta name="twitter:description" content="${description}" />`);
  if (!/property="og:image"/i.test(output))
    extra.push(`<meta property="og:image" content="${image}" />`);
  if (!/property="og:image:width"/i.test(output)) {
    extra.push(`<meta property="og:image:width" content="1200" />`);
    extra.push(`<meta property="og:image:height" content="630" />`);
    extra.push(`<meta property="og:image:alt" content="${imageAlt}" />`);
  }
  if (!/name="twitter:image"/i.test(output))
    extra.push(`<meta name="twitter:image" content="${image}" />`);
  if (!/rel="canonical"/i.test(output)) extra.push(`<link rel="canonical" href="${canonical}" />`);
  if (!/property="og:url"/i.test(output))
    extra.push(`<meta property="og:url" content="${canonical}" />`);
  if (!/property="og:locale"/i.test(output))
    extra.push(`<meta property="og:locale" content="zh_CN" />`);
  if (!/property="og:site_name"/i.test(output))
    extra.push(`<meta property="og:site_name" content="${SITE_NAME}" />`);
  if (meta.robots && !/name="robots"/i.test(output))
    extra.push(`<meta name="robots" content="${escapeAttribute(meta.robots)}" />`);
  if (!/application\/ld\+json/i.test(output)) {
    extra.push(
      `<script type="application/ld+json">${escapeJson({
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: SITE_NAME,
        url: meta.canonical,
        applicationCategory: 'NetworkApplication',
        operatingSystem: 'Any',
        description: meta.description,
        inLanguage: 'zh-CN',
      })}</script>`
    );
  }
  const footnote = meta.footnote ? `<p>${escapeAttribute(meta.footnote)}</p>` : '';
  extra.push(
    `<noscript><h1>${escapeAttribute(meta.h1 ?? meta.title)}</h1><p>${description}</p>${footnote}</noscript>`
  );
  if (!extra.length) return output;
  return /<\/head>/i.test(output)
    ? output.replace(/<\/head>/i, `${extra.join('\n')}</head>`)
    : `${output}${extra.join('\n')}`;
}

function injectHead(html, pathname, origin) {
  const key = pathMeta(pathname);
  if (!key) return html;
  const meta = META[key];
  const canonical = routeUrl(origin, key === '/ai/' || key === '/status/' ? key : pathname);
  return applyDocumentMeta(html, {
    title: meta.title,
    description: meta.description,
    canonical,
    h1: meta.h1,
    origin,
  });
}

function textResponse(body, contentType) {
  return new Response(body, {
    headers: {
      'cache-control': 'public, max-age=3600',
      'content-type': contentType,
    },
  });
}

function isPng(bytes) {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

export async function serveOgImage(request, env) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', {
      status: 405,
      headers: {
        allow: 'GET, HEAD',
        'content-type': 'text/plain; charset=utf-8',
      },
    });
  }
  const url = new URL(request.url);
  const assetUrl = new URL(request.url);
  assetUrl.pathname =
    url.pathname === '/assets/og-default.png' ? '/assets/og-default.png' : '/og.png';
  const asset = await env.ASSETS.fetch(new Request(assetUrl, { method: 'GET' }));
  const bytes = new Uint8Array(await asset.arrayBuffer());
  const type = asset.headers.get('content-type') ?? '';
  if (!isPng(bytes) && !type.startsWith('image/')) {
    return new Response('Not found', {
      status: 404,
      headers: {
        'cache-control': 'no-store',
        'content-type': 'text/plain; charset=utf-8',
        'x-content-type-options': 'nosniff',
      },
    });
  }
  const headers = new Headers();
  headers.set('content-type', type.startsWith('image/') ? type : 'image/png');
  headers.set('cache-control', 'public, max-age=86400');
  headers.set('x-content-type-options', 'nosniff');
  if (request.method === 'HEAD') return new Response(null, { status: 200, headers });
  return new Response(bytes, { status: 200, headers });
}

export async function handleSeo(request, env) {
  const url = new URL(request.url);
  const origin = url.origin;
  if (url.pathname === '/robots.txt')
    return textResponse(robotsTxt(origin), 'text/plain; charset=utf-8');
  if (url.pathname === '/sitemap.xml')
    return textResponse(sitemapXml(origin), 'application/xml; charset=utf-8');
  if (url.pathname === '/og.png' || url.pathname === '/assets/og-default.png')
    return serveOgImage(request, env);

  if (url.pathname.startsWith('/assets/')) {
    const asset = await env.ASSETS.fetch(request);
    const contentType = asset.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html')) return asset;
    return new Response('Not found', {
      status: 404,
      headers: {
        'cache-control': 'no-store',
        'content-type': 'text/plain; charset=utf-8',
      },
    });
  }

  if (url.pathname.startsWith('/api/') || url.pathname === '/favicon.svg')
    return env.ASSETS.fetch(request);

  const response = await env.ASSETS.fetch(request);
  const contentType = response.headers.get('content-type') ?? '';
  if (request.method === 'HEAD' || !pathMeta(url.pathname) || !contentType.includes('text/html'))
    return response;

  const headers = new Headers(response.headers);
  headers.set('cache-control', 'public, max-age=0, must-revalidate');
  return new Response(injectHead(await response.text(), url.pathname, origin), {
    status: response.status,
    headers,
  });
}
