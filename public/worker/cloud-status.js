import { HttpError, upstream } from './http.js';
import { statusFetch, withStatusSignal } from './status-cache.js';

const fail502 = () => new HttpError(502, '官方状态数据暂不可用');

const intoSummary = (indicator, description, incidents) => ({
  status: { indicator, description },
  ...(incidents ? { incidents } : {}),
});

const MAX_SOURCE_BYTES = 2_000_000;
const AZURE_MAX_BYTES = 8_000_000;
const TENCENT_DETAIL_CONCURRENCY = 4;

const DMIT_STATES = {
  operational: 'none',
  degraded: 'minor',
  partial_outage: 'minor',
  major_outage: 'major',
  maintenance: 'maintenance',
  under_maintenance: 'maintenance',
};

const AWS_LABELS = { 1: 'Impacted', 2: 'Degraded', 3: 'Disrupted' };

const BWH_MONTHS = {
  Jan: '01',
  Feb: '02',
  Mar: '03',
  Apr: '04',
  May: '05',
  Jun: '06',
  Jul: '07',
  Aug: '08',
  Sep: '09',
  Oct: '10',
  Nov: '11',
  Dec: '12',
};

const HTML_ENTITIES = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

export function parseDmit(data) {
  if (!DMIT_STATES[data?.status] || !Array.isArray(data.services)) throw fail502();
  return {
    ...intoSummary(DMIT_STATES[data.status], data.status),
    components: data.services.map((service) => ({
      id: service.slug,
      name: `${service.group} / ${service.name}`,
      status: service.status === 'degraded' ? 'degraded_performance' : service.status,
    })),
  };
}

export function parseGoogleCloud(data) {
  const malformed =
    !Array.isArray(data) ||
    data.some((item) => !item?.id || !item.begin || typeof item.external_desc !== 'string');
  if (malformed) throw fail502();
  const active = data.filter((item) => !item.end);
  const indicator = active.some((item) => item.severity === 'high')
    ? 'major'
    : active.length
      ? 'minor'
      : 'none';
  const incidents = active.map((item) => ({
    id: item.id,
    name: item.external_desc,
    status: item.most_recent_update?.status ?? 'investigating',
    updated_at: item.modified ?? item.begin,
    shortlink: `https://status.cloud.google.com/incidents/${encodeURIComponent(item.id)}`,
  }));
  return intoSummary(indicator, active.length ? '存在服务故障' : '正常运行', incidents);
}

export function parseAws(data) {
  const malformed =
    !Array.isArray(data) ||
    data.some((item) => !item?.arn || !['0', '1', '2', '3'].includes(String(item.status)));
  if (malformed) throw fail502();
  const active = data.filter((item) => String(item.status) !== '0');
  const incidents = active.map((item) => ({
    id: item.arn,
    name: `${item.service_name} (${item.region_name}) — ${item.summary}`,
    status: AWS_LABELS[item.status],
    updated_at: new Date(
      Math.max(
        Number(item.date),
        ...(item.event_log ?? []).map((update) => Number(update.timestamp))
      ) * 1000
    ).toISOString(),
    shortlink: 'https://health.aws.amazon.com/health/status',
  }));
  const indicator = active.some((item) => String(item.status) === '3')
    ? 'major'
    : active.length
      ? 'minor'
      : 'none';
  return intoSummary(indicator, active.length ? '存在服务故障' : '正常运行', incidents);
}

function bwhTimestamp(value) {
  const m = value?.match(/(\w{3})\w* (\d+), (\d+) (\d+):(\d+) (AM|PM) (PDT|PST)/);
  if (!m || !BWH_MONTHS[m[1]]) return undefined;
  const hours = (Number(m[4]) % 12) + (m[6] === 'PM' ? 12 : 0);
  const offset = m[7] === 'PDT' ? '-07:00' : '-08:00';
  const iso = `${m[3]}-${BWH_MONTHS[m[1]]}-${String(m[2]).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${m[5]}:00${offset}`;
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function bwhIssue([, body], label) {
  const name = body.match(/<h3><a[^>]*>([^<]+)<\/a><\/h3>/)?.[1]?.trim();
  if (!name) return undefined;
  const badge = body.match(/<span class="status status-([\w-]+)">([^<]+)<\/span>/);
  const href = body.match(/<h3><a href="([^"]+)"/)?.[1];
  const updated = body.match(/<p class="meta">Updated ([^<]+)<\/p>/)?.[1]?.trim();
  return {
    id: href ?? name,
    name,
    status: badge?.[2]?.trim() || label,
    kind: badge?.[1] ?? '',
    updated_at: bwhTimestamp(updated),
    shortlink: href ? new URL(href, 'https://bwhstatus.com/').href : 'https://bwhstatus.com/',
  };
}

export function parseBandwagon(html) {
  if (!html.includes('<title>BandwagonHost Status</title>')) throw fail502();
  const label = html
    .match(/<span\s+class="summary\s+summary-[\w-]+"\s*>([^<]+)<\/span>/)?.[1]
    .trim();
  const description = html.match(/<h1>([^<]+)<\/h1>/)?.[1].trim();
  if (!label || !description) throw fail502();

  if (label === 'Operational' && description === 'All systems operational') {
    const empty = /class="empty">No incidents in the last \d+ days\.<\/p>/.test(html);
    return intoSummary('none', description, empty ? [] : undefined);
  }

  // Ongoing events: the page summarizes as "N active" and lists issue
  // articles whose badges carry the per-incident kind.
  if (/^\d+\s+active/i.test(label) || /active incident/i.test(description)) {
    const issues = [...html.matchAll(/<article class="issue">([\s\S]*?)<\/article>/g)]
      .map((match) => bwhIssue(match, label))
      .filter(Boolean);
    const outage = issues.some((issue) => /outage|disruption|down/i.test(issue.kind));
    const maintenance = issues.some((issue) => /maintenance/i.test(issue.kind));
    const indicator = outage ? 'minor' : maintenance || issues.length ? 'maintenance' : 'minor';
    return intoSummary(
      indicator,
      description,
      issues.map(({ kind: _kind, ...incident }) => incident)
    );
  }
  if (/maintenance/i.test(label)) return intoSummary('maintenance', description);
  if (/outage|disruption|degraded|incident/i.test(label)) {
    return intoSummary('minor', description);
  }
  throw fail502();
}

const toIso = (value) => {
  if (value == null || value === '') return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
};

const ALIYUN_EVENT_TYPES = ['ALARM', 'NOTIFICATION', 'NORMAL'];

export function parseAliyun(data) {
  if (data?.success !== true || data.code !== 200 || !Array.isArray(data.data)) throw fail502();
  const malformed = data.data.some(
    (item) =>
      item?.id == null ||
      typeof item.title !== 'string' ||
      !ALIYUN_EVENT_TYPES.includes(item.eventType)
  );
  if (malformed) throw fail502();
  const active = data.data.filter((item) => !item.endTime && item.eventType !== 'NORMAL');
  const incidents = active.map((item) => ({
    id: String(item.id),
    name: item.title,
    status: item.eventType,
    updated_at: toIso(item.lastUpdateTime ?? item.startTime),
    shortlink: `https://status.aliyun.com/#/eventDetail?eventId=${encodeURIComponent(item.id)}`,
  }));
  const indicator = active.some((item) => item.eventType === 'ALARM')
    ? 'major'
    : active.length
      ? 'minor'
      : 'none';
  return intoSummary(indicator, active.length ? '存在服务故障或提示' : '正常运行', incidents);
}

function unwrapTencent(data) {
  if (data?.Response?.Error || !data?.Response?.Data) throw fail502();
  return data.Response.Data;
}

export function tencentRegions(data) {
  const areas = unwrapTencent(data).AreaDetailList;
  const malformed =
    !Array.isArray(areas) ||
    !areas.length ||
    areas.some((area) => !Array.isArray(area?.RegionList));
  if (malformed) throw fail502();
  const regions = areas.flatMap((area) => area.RegionList);
  const invalid =
    !regions.length ||
    regions.some(
      (region) =>
        typeof region?.RegionId !== 'string' ||
        typeof region.RegionName !== 'string' ||
        typeof region.EventsIn !== 'boolean'
    );
  if (invalid) throw fail502();
  return regions;
}

const TENCENT_STATUSES = ['NORMAL', 'NOTIFY', 'ABNORMAL'];

export function parseTencentProducts(data, region) {
  const categories = unwrapTencent(data).CategoryList;
  const malformed =
    !Array.isArray(categories) ||
    !categories.length ||
    categories.some((category) => !Array.isArray(category?.ProductList));
  if (malformed) throw fail502();
  const products = categories.flatMap((category) => category.ProductList);
  if (!products.length || products.some((p) => !TENCENT_STATUSES.includes(p?.CurrentStatus))) {
    throw fail502();
  }
  return products
    .filter((product) => product.CurrentStatus !== 'NORMAL')
    .map((product) => ({
      id: `${region.RegionId}/${product.ProductId}`,
      name: `${region.RegionName} / ${product.ProductName}`,
      status: product.CurrentStatus,
      shortlink: `https://status.tencentcloud.com/?region=${encodeURIComponent(region.RegionId)}`,
    }));
}

export function parseTencentBanner(data) {
  const banner = unwrapTencent(data);
  if (typeof banner.IsShow !== 'boolean' || !TENCENT_STATUSES.includes(banner.Status)) {
    throw fail502();
  }
  if (!banner.IsShow || banner.Status === 'NORMAL') return [];
  if (banner.Id == null || typeof banner.Desc !== 'string') throw fail502();
  return [
    {
      id: `notice/${banner.Id}`,
      name: banner.Title || banner.Desc,
      status: banner.Status,
      shortlink: 'https://status.tencentcloud.com/',
    },
  ];
}

const tencentDetailQueue = [];
let activeTencentDetails = 0;

function pumpTencentQueue() {
  while (activeTencentDetails < TENCENT_DETAIL_CONCURRENCY && tencentDetailQueue.length) {
    const request = tencentDetailQueue.shift();
    activeTencentDetails += 1;
    Promise.resolve()
      .then(request.task)
      .then(request.resolve, request.reject)
      .finally(() => {
        activeTencentDetails -= 1;
        pumpTencentQueue();
      });
  }
}

function limitedTencentDetail(task) {
  return new Promise((resolve, reject) => {
    tencentDetailQueue.push({ task, resolve, reject });
    pumpTencentQueue();
  });
}

const TENCENT_BANNER_URL =
  'https://status.tencentcloud.com/v1/api/status/DescribeHappening?BelongSite=1';
const TENCENT_REGION_EVENTS =
  'https://status.tencentcloud.com/v1/api/status/DescribeProductEventForRegionInPeriod?';

async function tencentStatus(url, signal) {
  const [regionData, bannerData] = await Promise.all([
    upstream(url, withStatusSignal(signal)),
    upstream(TENCENT_BANNER_URL, withStatusSignal(signal)),
  ]);
  const regions = tencentRegions(regionData);
  const date = new Date().toISOString().slice(0, 10);
  const details = await Promise.all(
    regions
      .filter((region) => region.EventsIn)
      .map((region) =>
        limitedTencentDetail(async () => {
          const query = new URLSearchParams({
            BelongSite: '1',
            RegionId: region.RegionId,
            NumOfDay: '1',
            EndDate: date,
          });
          return parseTencentProducts(
            await upstream(TENCENT_REGION_EVENTS + query, withStatusSignal(signal)),
            region
          );
        })
      )
  );
  const incidents = [...parseTencentBanner(bannerData), ...details.flat()];
  const indicator = incidents.some((item) => item.status === 'ABNORMAL')
    ? 'major'
    : incidents.length
      ? 'minor'
      : 'none';
  return {
    ...intoSummary(indicator, incidents.length ? '存在服务故障或提示' : '正常运行', incidents),
    components: regions.map((region) => ({
      id: region.RegionId,
      name: region.RegionName,
      status: incidents.some((item) => item.id.startsWith(`${region.RegionId}/`))
        ? 'degraded_performance'
        : 'operational',
    })),
  };
}

const stripHtml = (html) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g, (entity) => HTML_ENTITIES[entity])
    .replace(/\s+/g, ' ')
    .trim();

export function parseAzure(html) {
  const table = html.match(
    /<table\b[^>]*data-zone-name="current-impact"[^>]*>([\s\S]*?)<\/table>/
  )?.[1];
  if (!table) throw fail502();
  const rows = [...table.matchAll(/<tr\b[^>]*class="current-incident"[^>]*>([\s\S]*?)<\/tr>/g)].map(
    (match) => match[1]
  );
  if (!rows.length) throw fail502();
  const noEvents = (row) =>
    /class="bg-green"/.test(row) &&
    stripHtml(row).startsWith('There are currently no active events.');
  const active = rows.filter((row) => !noEvents(row));
  if (active.some((row) => !stripHtml(row) || !/<td\b/.test(row))) throw fail502();
  return intoSummary(
    active.length ? 'major' : 'none',
    active.length ? '存在公开服务事件' : '未报告广泛影响的事件',
    active.map((row, index) => ({
      id: `azure-current-${index}`,
      name: stripHtml(row).slice(0, 500),
      status: 'investigating',
      shortlink: 'https://azure.status.microsoft/en-us/status/',
    }))
  );
}

// AWS serves UTF-16 JSON; BandwagonHost currently exposes a small HTML summary.
async function sourceText(url, maxBytes = MAX_SOURCE_BYTES, signal) {
  const response = await statusFetch(url, {
    signal,
    redirect: 'manual',
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new HttpError(response.status === 429 ? 429 : 502, '官方状态数据暂不可用');
  }
  const reader = response.body?.getReader();
  if (!reader) throw fail502();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw fail502();
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const encoding =
    bytes[0] === 0xfe && bytes[1] === 0xff
      ? 'utf-16be'
      : bytes[0] === 0xff && bytes[1] === 0xfe
        ? 'utf-16le'
        : 'utf-8';
  return new TextDecoder(encoding).decode(bytes);
}

export function parseQwenStatus(catalog, current) {
  const malformed =
    catalog?.success !== true ||
    !Array.isArray(catalog.data) ||
    !catalog.data.some((group) =>
      group.productList?.some((product) => product.productId === 'sfm')
    ) ||
    current?.success !== true ||
    !Array.isArray(current.data) ||
    current.data.length !== 1;
  if (malformed) throw fail502();
  const { productStatus, eventDetails } = current.data[0] ?? {};
  const badShape = (value) => !value || typeof value !== 'object' || Array.isArray(value);
  if (badShape(productStatus) || badShape(eventDetails)) throw fail502();
  const refs = productStatus.sfm ?? [];
  if (!Array.isArray(refs)) throw fail502();
  const events = refs.map((ref) => {
    const event = eventDetails[ref.eventId];
    if (!event) throw fail502();
    return event;
  });
  const result = parseAliyun({ success: true, code: 200, data: events });
  const componentStatus =
    result.status.indicator === 'none'
      ? 'operational'
      : result.status.indicator === 'major'
        ? 'major_outage'
        : 'degraded_performance';
  return {
    ...result,
    components: [{ id: 'sfm', name: '大模型服务平台百炼', status: componentStatus }],
  };
}

const CLOUD_HANDLERS = {
  aliyun: (service, signal) => upstream(service.url, withStatusSignal(signal)).then(parseAliyun),
  'tencent-cloud': (service, signal) => tencentStatus(service.url, signal),
  azure: (service, signal) => sourceText(service.url, AZURE_MAX_BYTES, signal).then(parseAzure),
  dmit: (service, signal) => upstream(service.url, withStatusSignal(signal)).then(parseDmit),
  bandwagonhost: (service, signal) =>
    sourceText(service.url, MAX_SOURCE_BYTES, signal).then(parseBandwagon),
  'google-cloud': (service, signal) =>
    upstream(service.url, withStatusSignal(signal)).then(parseGoogleCloud),
  aws: async (service, signal) =>
    parseAws(JSON.parse(await sourceText(service.url, MAX_SOURCE_BYTES, signal))),
};

export async function getCloudStatus(service, signal) {
  if (service.id === '34') {
    const [catalog, current] = await Promise.all([
      upstream(
        'https://status.aliyun.com/api/status/listProductForAllTypeInRegion?regionId=non-regional',
        withStatusSignal(signal)
      ),
      upstream(service.url, withStatusSignal(signal)),
    ]);
    return parseQwenStatus(catalog, current);
  }
  const handler = CLOUD_HANDLERS[service.id];
  return handler ? handler(service, signal) : upstream(service.url, withStatusSignal(signal));
}
