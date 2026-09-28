import { HttpError, boundedJson, upstream } from './http.js';
import { parseTelegramStatus } from './telegram-status.js';

const fail502 = () => new HttpError(502, '官方状态数据暂不可用');
const USER_AGENT = 'EgressScope/1.0';
const REQUEST_TIMEOUT_MS = 10_000;

const AGENT_HEADERS = { 'User-Agent': USER_AGENT };

async function fetchPage(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: AGENT_HEADERS,
  });
  if (!response.ok) throw fail502();
  return response.text();
}

const RSS_NAMED = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
};

function feedItems(xml) {
  if (!/<rss\b/.test(xml) || !/<channel\b/.test(xml) || !/<\/channel>\s*<\/rss>\s*$/.test(xml)) {
    throw fail502();
  }
  const items = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)];
  if (items.length !== (xml.match(/<item\b/g) ?? []).length) throw fail502();
  return items;
}

function feedField(body, tag) {
  const value = body.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`))?.[1].trim() ?? '';
  if (value.startsWith('<![CDATA[') && value.endsWith(']]>')) return value.slice(9, -3);
  return value.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);/g, (entity) => {
    if (RSS_NAMED[entity]) return RSS_NAMED[entity];
    const code = entity.startsWith('&#x')
      ? parseInt(entity.slice(3, -1), 16)
      : Number(entity.slice(2, -1));
    if (code < 0 || code > 0x10ffff) throw fail502();
    return String.fromCodePoint(code);
  });
}

const DEEPSEEK_DONE = ['resolved', 'completed', 'cancelled', 'scheduled'];
const DEEPSEEK_LIVE = [
  'investigating',
  'identified',
  'monitoring',
  'ongoing',
  'in_progress',
  'verifying',
];
const DEEPSEEK_URGENT = ['investigating', 'identified', 'monitoring'];

export function parseDeepSeek(xml) {
  const incidents = [];
  for (const [, body] of feedItems(xml)) {
    const description = feedField(body, 'description');
    const state = description
      .match(/<strong>\s*Status:\s*<\/strong>\s*([\w-]+)/i)?.[1]
      .toLowerCase();
    if (DEEPSEEK_DONE.includes(state)) continue;
    if (!DEEPSEEK_LIVE.includes(state)) throw fail502();
    const id = feedField(body, 'guid');
    const name = feedField(body, 'title');
    const shortlink = feedField(body, 'link');
    if (!id || !name || !shortlink.startsWith('https://status.deepseek.com/')) throw fail502();
    // RSS pubDate is publication time, not necessarily the latest update time.
    incidents.push({ id, name, status: state, shortlink });
  }
  const indicator = incidents.some((item) => DEEPSEEK_URGENT.includes(item.status))
    ? 'minor'
    : incidents.length
      ? 'maintenance'
      : 'none';
  return {
    status: {
      indicator,
      description: incidents.length ? '存在公开服务事件' : '订阅源未报告未解决事件',
    },
    incidents,
  };
}

export function parseGemini(data) {
  const rows = data?.[0]?.[0];
  if (!Array.isArray(rows)) throw fail502();
  const incidents = [];
  for (const row of rows) {
    if (
      !Array.isArray(row) ||
      typeof row[0] !== 'string' ||
      !Array.isArray(row[3]) ||
      !row[3].length
    ) {
      throw fail502();
    }
    const updates = [...row[3]].sort((a, b) => Number(b[2]?.[0]) - Number(a[2]?.[0]));
    const latest = updates[0];
    if (![1, 2, 3, 4, 5].includes(latest[0]) || !Number.isFinite(Number(latest[2]?.[0]))) {
      throw fail502();
    }
    if (latest[0] === 4) continue;
    incidents.push({
      id: row[0],
      name: row[1],
      status: latest[0] === 1 ? 'investigating' : 'monitoring',
      updated_at: new Date(Number(latest[2][0]) * 1000).toISOString(),
      shortlink: 'https://aistudio.google.com/status',
    });
  }
  return {
    status: {
      indicator: incidents.length ? 'minor' : 'none',
      description: incidents.length ? '存在服务故障' : '正常运行',
    },
    incidents,
  };
}

function evidenceResult(endpoints, description, note) {
  return {
    status: { indicator: 'unknown', description },
    evidence: {
      kind: 'reachability',
      label: '端点可达性探测',
      endpoints,
      note,
    },
  };
}

async function probeReachability(
  targets,
  okDescription,
  failDescription,
  { rssUnavailable = false, allowNoResponse = false } = {}
) {
  const results = await Promise.allSettled(
    targets.map(async ({ url, label }) => {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        redirect: 'manual',
        headers: AGENT_HEADERS,
      });
      await response.body?.cancel();
      return { label, url, transport: 'response', httpStatus: response.status };
    })
  );
  const endpoints = results.map((result, index) =>
    result.status === 'fulfilled'
      ? result.value
      : { label: targets[index].label, url: targets[index].url, transport: 'failed' }
  );

  const reachable = endpoints.filter((endpoint) => endpoint.transport === 'response').length;
  if (reachable === 0 && !allowNoResponse) throw new HttpError(502, failDescription);
  if (reachable === 0) {
    return evidenceResult(
      endpoints,
      `${rssUnavailable ? '官方 RSS 读取失败；' : ''}端点均不可达，无法评估业务状态`,
      '官方状态源和参考端点均未返回响应。'
    );
  }

  const httpStatuses = endpoints
    .filter((endpoint) => endpoint.transport === 'response')
    .map((endpoint) => endpoint.httpStatus);
  const prefix = rssUnavailable ? '官方 RSS 读取失败；' : '';
  const hasServerError = httpStatuses.some((status) => status >= 500);
  const hasFailedEndpoint = endpoints.some((endpoint) => endpoint.transport === 'failed');
  const description = hasServerError
    ? `${prefix}收到 HTTP ${httpStatuses.filter((status) => status >= 500).join('、')} 响应，业务状态未知；5xx 只表示端点异常，不能据此判断整个平台故障`
    : hasFailedEndpoint
      ? `${prefix}部分端点已响应，部分不可达；业务状态未知`
      : `${prefix}端点可达，但未提供官方运行状态`;
  return evidenceResult(
    endpoints,
    description,
    rssUnavailable
      ? '官方 RSS 未能读取，以下结果仅供连通性参考。'
      : '收到 HTTP 响应只表示端点可达，不代表官方业务健康。'
  );
}

export async function getDeepSeekStatus(options = {}) {
  const targets = [
    { url: 'https://api.deepseek.com/', label: 'API 网关' },
    { url: 'https://www.deepseek.com/', label: '官网' },
  ];
  return probeReachability(targets, 'DeepSeek 服务可访问', 'DeepSeek 服务不可达', {
    ...options,
    allowNoResponse: options.rssUnavailable === true,
  });
}

async function probeService(service) {
  const targets = service.probe.map((url) => ({ url, label: url }));
  return probeReachability(
    targets,
    service.probeOkDescription ?? `${service.name} 服务可访问`,
    service.probeFailDescription ?? `${service.name} 服务不可达`
  );
}

const GROK_LIVE = ['investigating', 'identified', 'monitoring', 'open', 'ongoing'];

export function parseGrokFeed(xml) {
  const incidents = [];
  for (const [, body] of feedItems(xml)) {
    // Categories describe the current state; description contains historical updates too.
    const metadata = body.replace(/<description\b[^>]*>[\s\S]*?<\/description>/g, '');
    const categories = [...metadata.matchAll(/<category>([^<]+)<\/category>/g)].map((match) =>
      match[1].trim().toLowerCase()
    );
    if (categories.includes('resolved')) continue;
    const description = feedField(body, 'description');
    const state = description
      .match(/<h3>\s*Status:\s*([\w -]+)\s*<\/h3>/i)?.[1]
      .trim()
      .toLowerCase();
    if (!state || !GROK_LIVE.includes(state)) throw fail502();
    const id = feedField(metadata, 'guid');
    const name = feedField(metadata, 'title');
    const shortlink = feedField(metadata, 'link');
    if (!id || !name || !shortlink.startsWith('https://status.x.ai/')) throw fail502();
    const dates = [...description.matchAll(/<strong>([^<]+)<\/strong>/g)]
      .map((match) => Date.parse(match[1]))
      .filter(Number.isFinite);
    const published = Date.parse(feedField(metadata, 'pubDate'));
    if (Number.isFinite(published)) dates.push(published);
    incidents.push({
      id,
      name,
      status: state,
      shortlink,
      ...(dates.length ? { updated_at: new Date(Math.max(...dates)).toISOString() } : {}),
    });
  }
  return {
    status: {
      indicator: incidents.length ? 'minor' : 'none',
      description: incidents.length ? '存在公开服务事件' : '订阅源未报告未解决事件',
    },
    incidents,
  };
}

const REPLICATE_STATES = {
  operational: 'none',
  degraded_performance: 'minor',
  partial_outage: 'minor',
  major_outage: 'major',
  under_maintenance: 'maintenance',
};
const REPLICATE_LIVE = ['investigating', 'identified', 'monitoring'];
const REPLICATE_MAINTENANCE = ['in_progress', 'verifying'];

export function parseReplicate(data) {
  const component = data?.components?.find((item) => item.id === 'fvgfcmy66tdr');
  const malformed =
    !component ||
    !REPLICATE_STATES[component.status] ||
    !Array.isArray(data.incidents) ||
    !Array.isArray(data.scheduled_maintenances);
  if (malformed) throw fail502();
  const affectsReplicate = (item) => item.components?.some((part) => part.id === component.id);
  const incidents = data.incidents.filter(
    (item) => REPLICATE_LIVE.includes(item.status) && affectsReplicate(item)
  );
  const maintenance = data.scheduled_maintenances.filter(
    (item) => REPLICATE_MAINTENANCE.includes(item.status) && affectsReplicate(item)
  );
  return {
    status: {
      indicator:
        component.status === 'operational' && maintenance.length
          ? 'maintenance'
          : REPLICATE_STATES[component.status],
      description: component.status,
    },
    components: [component],
    incidents: [...incidents, ...maintenance],
  };
}

async function geminiStatus(service) {
  const html = await fetchPage(service.page);
  // Public application identifiers shipped by AI Studio, not visitor credentials.
  const keys = [...new Set(html.match(/AIza[\w-]+/g) ?? [])];
  for (const key of keys) {
    const response = await fetch(service.url, {
      method: 'POST',
      body: '[]',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        'Content-Type': 'application/json+protobuf',
        'X-Goog-Api-Key': key,
        Referer: 'https://aistudio.google.com/',
      },
    });
    if (!response.ok) {
      await response.body?.cancel();
      continue;
    }
    return parseGemini(await boundedJson(response));
  }
  throw fail502();
}

export async function getAiStatus(service) {
  if (Array.isArray(service.probe) && service.probe.length) return probeService(service);
  switch (service.id) {
    case 'telegram':
      return parseTelegramStatus(
        await upstream(service.url, { cf: { cacheTtl: 60, cacheEverything: true } })
      );
    case '33':
      return parseGrokFeed(await fetchPage(service.url));
    case '11':
      return parseReplicate(await upstream(service.url, { headers: AGENT_HEADERS }));
    case '32':
      // Prefer the official RSS when reachable. A fallback probe is transport
      // evidence only, so it must never be rendered as official health.
      try {
        return parseDeepSeek(await fetchPage(service.url));
      } catch {
        return getDeepSeekStatus({ rssUnavailable: true });
      }
    case '31':
      return geminiStatus(service);
    default:
      return upstream(service.url);
  }
}
