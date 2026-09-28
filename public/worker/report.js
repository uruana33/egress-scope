import { HttpError, inputJson, json, publicIp } from './http.js';
import { applyDocumentMeta, escapeJson } from './seo.js';

const ID_RE = /^r_[0-9A-HJKMNP-TV-Z]{16}$/;
const CLIENT_RE = /^[a-z0-9_-]{1,16}$/;
const FLAG_KEYS = [
  'residential',
  'datacenter',
  'mobile',
  'vpn',
  'proxy',
  'tor',
  'crawler',
  'abuser',
];
const STATUSES = new Set(['good', 'moderate', 'poor', 'unknown']);
const HOUR_MS = 60 * 60 * 1000;
const HOUR_LIMIT = 30;
const PRIVACY =
  '本报告为用户主动生成的摘要快照，不含完整浏览器指纹；到期自动删除。WebRTC 检测在用户浏览器本地完成，本站不静默上报真实 ISP IP。';

function requireKv(env) {
  if (!env.REPORTS || typeof env.REPORTS.get !== 'function')
    throw new HttpError(503, '分享报告存储未配置');
  return env.REPORTS;
}

function cleanText(value, max, label) {
  if (typeof value !== 'string') throw new HttpError(400, `${label} 无效`);
  const text = value
    // eslint-disable-next-line no-control-regex -- Strip terminal control characters from stored text.
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  if ([...text].length > max) throw new HttpError(400, `${label} 最长 ${max} 字`);
  return text;
}

function optionalIp(value, field) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw new HttpError(400, `${field} 无效`);
  try {
    return publicIp(value);
  } catch (error) {
    if (error instanceof HttpError) throw new HttpError(400, `${field}：${error.message}`);
    throw error;
  }
}

function optionalBool(value, field) {
  if (value == null) return null;
  if (typeof value !== 'boolean') throw new HttpError(400, `${field} 必须是布尔值`);
  return value;
}

function optionalScore(value) {
  if (value == null) return null;
  if (!Number.isInteger(value) || value < 0 || value > 100)
    throw new HttpError(400, 'quality_score 必须是 0 到 100 的整数');
  return value;
}

function optionalStatus(value) {
  if (value == null) return null;
  if (typeof value !== 'string' || !STATUSES.has(value))
    throw new HttpError(400, 'quality_status 无效');
  return value;
}

function optionalAsn(value) {
  if (value == null) return null;
  if (!Number.isInteger(value) || value < 0 || value > 4294967295)
    throw new HttpError(400, 'asn 无效');
  return value;
}

function optionalFlags(value) {
  if (value == null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'flags 无效');
  const flags = {};
  for (const key of FLAG_KEYS) {
    if (value[key] == null) continue;
    if (typeof value[key] !== 'boolean') throw new HttpError(400, `flags.${key} 必须是布尔值`);
    flags[key] = value[key];
  }
  return Object.keys(flags).length ? flags : undefined;
}

function parseSummary(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new HttpError(400, 'summary 无效');
  const summary = {
    domestic_ip: optionalIp(value.domestic_ip, 'domestic_ip'),
    overseas_ip: optionalIp(value.overseas_ip, 'overseas_ip'),
    egress_consistent: optionalBool(value.egress_consistent, 'egress_consistent'),
    webrtc_match_http: optionalBool(value.webrtc_match_http, 'webrtc_match_http'),
    dns_match_http: optionalBool(value.dns_match_http, 'dns_match_http'),
    quality_score: optionalScore(value.quality_score),
    quality_status: optionalStatus(value.quality_status),
    asn: optionalAsn(value.asn),
    isp: value.isp == null ? null : cleanText(value.isp, 80, 'isp'),
  };
  const flags = optionalFlags(value.flags);
  if (flags) summary.flags = flags;
  return summary;
}

function reportOrigin(request) {
  return new URL(request.url).origin;
}

async function rateKey(ip) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`report:${ip}`));
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `rate:${hex.slice(0, 32)}`;
}

async function consumeCreateQuota(kv, ip) {
  const key = await rateKey(ip);
  const now = Date.now();
  let state = null;
  const raw = await kv.get(key);
  if (raw) {
    try {
      state = JSON.parse(raw);
    } catch {
      state = null;
    }
  }
  if (!state || typeof state.reset !== 'number' || state.reset <= now)
    state = { count: 0, reset: now + HOUR_MS };
  if (state.count >= HOUR_LIMIT)
    throw new HttpError(429, '每小时最多创建 30 份分享报告，请稍后再试');
  state.count += 1;
  const ttl = Math.max(60, Math.ceil((state.reset - now) / 1000));
  await kv.put(key, JSON.stringify(state), { expirationTtl: ttl });
}

function newId() {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let id = 'r_';
  for (const byte of bytes) id += alphabet[byte % alphabet.length];
  return id;
}

export async function createReport(request, env, ip) {
  const kv = requireKv(env);
  const body = await inputJson(request);
  if (body.version !== 1) throw new HttpError(400, 'version 必须为 1');
  if (body.client != null && (typeof body.client !== 'string' || !CLIENT_RE.test(body.client)))
    throw new HttpError(400, 'client 无效');
  const ttlDays = body.ttl_days == null ? 30 : body.ttl_days;
  if (![7, 30, 90].includes(ttlDays)) throw new HttpError(400, 'ttl_days 仅支持 7、30 或 90');
  const summary = parseSummary(body.summary);
  const notes = body.notes == null ? null : cleanText(body.notes, 120, 'notes');
  await consumeCreateQuota(kv, ip || 'local');
  const created = new Date();
  const expires = new Date(created.getTime() + ttlDays * 24 * 60 * 60 * 1000);
  let id = newId();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!(await kv.get(id))) break;
    id = newId();
  }
  const origin = reportOrigin(request);
  const record = {
    id,
    url: `${origin}/r/${id}`,
    created_at: created.toISOString(),
    expires_at: expires.toISOString(),
    summary,
  };
  if (notes) record.notes = notes;
  await kv.put(id, JSON.stringify(record), {
    expirationTtl: ttlDays * 24 * 60 * 60,
  });
  return json({ id, url: record.url, expires_at: record.expires_at });
}

export async function readReport(id, env) {
  if (!ID_RE.test(id)) throw new HttpError(404, '报告不存在或已过期');
  const kv = requireKv(env);
  const raw = await kv.get(id);
  if (!raw) throw new HttpError(404, '报告不存在或已过期');
  let record;
  try {
    record = JSON.parse(raw);
  } catch {
    throw new HttpError(404, '报告不存在或已过期');
  }
  if (!record || record.id !== id || !record.summary)
    throw new HttpError(404, '报告不存在或已过期');
  return json(record, 200, { 'Access-Control-Allow-Origin': '*' });
}

function pair(label, value) {
  if (value === true) return `${label}=HTTP`;
  if (value === false) return `${label}≠HTTP`;
  return `${label}未测`;
}

export function reportShareMeta(summary, id, origin) {
  const consistent =
    summary.egress_consistent === true ? '是' : summary.egress_consistent === false ? '否' : '未测';
  const score = summary.quality_score == null ? '未知' : String(summary.quality_score);
  const relation =
    summary.egress_consistent === true
      ? '国内=海外'
      : summary.egress_consistent === false
        ? '国内≠海外'
        : '国内／海外未测';
  const asn = Number.isInteger(summary.asn) ? `ASN${summary.asn}` : 'ASN未知';
  return {
    title: `出口一致性报告 · 一致=${consistent} · 分${score} · 出口观测台`,
    ogTitle: `出口一致性：${relation} · 质量分 ${summary.quality_score == null ? '—' : summary.quality_score}`,
    description: `${pair('WebRTC', summary.webrtc_match_http)} · ${pair('DNS', summary.dns_match_http)} · ${asn} · ${new URL(origin).hostname}`,
    canonical: `${origin}/r/${id}`,
    origin,
    h1: `出口一致性：${relation}`,
  };
}

async function spaShell(request, env) {
  if (env.LOCAL_DEV === 'true') {
    try {
      const vite = new URL(request.url);
      vite.hostname = '127.0.0.1';
      vite.port = '5137';
      vite.protocol = 'http:';
      vite.pathname = '/';
      vite.search = '';
      const response = await fetch(new Request(vite, { method: 'GET' }));
      const type = response.headers.get('content-type') ?? '';
      if (response.ok && type.includes('text/html')) return await response.text();
    } catch {
      /* Vite may be down in local worker mode. */
    }
  }
  const assetUrl = new URL(request.url);
  assetUrl.pathname = '/index.html';
  let response = await env.ASSETS.fetch(new Request(assetUrl, { method: 'GET' }));
  let type = response.headers.get('content-type') ?? '';
  if (!type.includes('text/html')) {
    assetUrl.pathname = '/';
    response = await env.ASSETS.fetch(new Request(assetUrl, { method: 'GET' }));
    type = response.headers.get('content-type') ?? '';
  }
  if (type.includes('text/html')) return await response.text();
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>出口观测台</title></head><body><div id="root"></div></body></html>`;
}

export async function handleReportPage(request, env) {
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
  const id = decodeURIComponent(url.pathname.replace(/\/+$/, '').slice(3));
  const origin = reportOrigin(request);
  let status = 200;
  let meta = {
    title: '报告不存在或已过期 · 出口观测台',
    description: '该分享链接不存在，或已超过保存期限。',
    canonical: `${origin}${url.pathname.replace(/\/+$/, '') || '/r'}`,
    h1: '报告不存在或已过期',
    robots: 'noindex',
    footnote: PRIVACY,
    origin,
  };
  let record = null;
  if (!ID_RE.test(id)) status = 404;
  else if (!env.REPORTS || typeof env.REPORTS.get !== 'function') {
    status = 503;
    meta = {
      ...meta,
      title: '分享报告暂不可用 · 出口观测台',
      description: '分享报告存储未配置。',
      h1: '分享报告暂不可用',
    };
  } else {
    const raw = await env.REPORTS.get(id);
    if (!raw) status = 404;
    else {
      try {
        record = JSON.parse(raw);
      } catch {
        record = null;
      }
      if (!record || record.id !== id || !record.summary) {
        record = null;
        status = 404;
      } else {
        meta = {
          ...reportShareMeta(record.summary, id, origin),
          footnote: PRIVACY,
        };
      }
    }
  }
  let html = applyDocumentMeta(await spaShell(request, env), meta);
  if (record) {
    html = html.replace(
      /<\/head>/i,
      `<script type="application/json" id="share-report">${escapeJson(record)}</script></head>`
    );
  }
  const headers = {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  };
  if (request.method === 'HEAD') return new Response(null, { status, headers });
  return new Response(html, { status, headers });
}
