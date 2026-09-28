import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import '../tests/register-paths.mjs';

const { assessQuality } = await import('../src/views/ip/model/quality.ts');

const ip = z.string().refine((value) => isIP(value) !== 0, 'Invalid IP');
const date = z.string().refine((value) => Number.isFinite(Date.parse(value)), 'Invalid timestamp');
const kinds = [
  'public-service',
  'residential',
  'org',
  'datacenter',
  'mobile',
  'isp',
  'vpn-exit',
  'tor-exit',
  'relay-exit',
  'residential-proxy',
  'anonymous-exit',
];
const usageKinds = new Set(['public-service', 'residential', 'org', 'datacenter', 'mobile', 'isp']);
const anonymityKinds = new Set([
  'vpn-exit',
  'tor-exit',
  'relay-exit',
  'residential-proxy',
  'anonymous-exit',
]);
const providers = [
  'ipinfo',
  'ip2location',
  'ipapi',
  'scamalytics',
  'ippure',
  'proxycheck',
  'ipqs',
  'abuseipdb',
  'dnsbl',
  'torexit',
  'ipregistry',
];
export const DEFAULT_ALIGNMENT_WINDOW_MS = 30 * 86400000;
export const DEFAULT_SCOPE_WINDOWS_MS = {
  usage: DEFAULT_ALIGNMENT_WINDOW_MS,
  // Exit membership and other anonymity labels can change quickly.
  anonymity: 24 * 60 * 60 * 1000,
};
const labelWindow = z
  .number()
  .finite()
  .positive()
  .max(365 * 24)
  .optional();
const labelsSchema = z.object({
  schemaVersion: z.literal(1),
  labels: z.array(
    z.object({
      id: z.string().min(1),
      ip,
      group: z.string().min(1),
      expectedKind: z.enum(kinds),
      scope: z.enum(['usage', 'anonymity']),
      metric: z.enum(['usage', 'anonymity']).optional(),
      alignmentWindowHours: labelWindow,
      maxAgeHours: labelWindow,
      validityWindowHours: labelWindow,
      confidence: z.literal('official'),
      observedAt: date,
      expiresAt: date.optional(),
      source: z.object({
        url: z.url(),
        excerpt: z.string().min(10),
        fetchedAt: date,
      }),
    })
  ),
});
const flags = z
  .object(
    Object.fromEntries(
      ['vpn', 'proxy', 'tor', 'relay', 'residentialProxy', 'hosting', 'anonymous'].map((key) => [
        key,
        z.boolean().optional(),
      ])
    )
  )
  .strict();
const reading = z.object({
  id: z.string(),
  source: z.enum(providers),
  metric: z.enum([
    'fraud',
    'risk',
    'purity',
    'usage',
    'privacy',
    'proxy',
    'native',
    'blocklist',
    'abuse',
  ]),
  value: z.string(),
  hint: z.string(),
  tone: z.enum(['good', 'warn', 'bad', 'neutral']),
  href: z.url(),
  flags: flags.optional(),
});
const samplesSchema = z.object({
  schemaVersion: z.literal(1),
  samples: z.array(
    z.object({
      id: z.string().min(1),
      ip,
      collectedAt: date,
      coffee: z.object({ ip }).passthrough().nullable(),
      cross: z
        .object({
          ip,
          readings: z.array(reading),
          unavailable: z.array(z.enum(providers)),
          checkedAt: date.optional(),
        })
        .passthrough()
        .nullable(),
      acquisition: z.object({
        coffee: z.object({
          url: z.url(),
          ok: z.boolean(),
          error: z.string().optional(),
        }),
        cross: z.object({
          url: z.url(),
          ok: z.boolean(),
          error: z.string().optional(),
        }),
      }),
    })
  ),
});

export function canonicalIp(value) {
  return value.includes(':') ? new URL(`https://[${value}]/`).hostname.slice(1, -1) : value;
}

function hostAllowed(url, allowedHosts) {
  return (
    url.protocol === 'https:' &&
    [...allowedHosts].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
  );
}

const labelSourceHosts = new Set([
  'cloudflare.com',
  'google.com',
  'quad9.net',
  'opendns.com',
  'nextdns.io',
  'adguard.com',
  'cleanbrowsing.org',
]);

const readingHosts = {
  ip2location: new Set(['ip2location.io']),
  ipinfo: new Set(['ipinfo.io']),
  ipapi: new Set(['ip-api.com']),
  scamalytics: new Set(['scamalytics.com']),
  ippure: new Set(['ippure.com', '123169.xyz']),
  proxycheck: new Set(['proxycheck.io']),
  ipqs: new Set(['ipqualityscore.com']),
  abuseipdb: new Set(['abuseipdb.com']),
  dnsbl: new Set(['mxtoolbox.com']),
  torexit: new Set(['torproject.org']),
  ipregistry: new Set(['ipregistry.co']),
};

const coffeeAcquisitionHosts = new Set(['ip.net.coffee']);
const crossAcquisitionHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);

function labelAlignmentWindowMs(label, options = {}) {
  const configuredHours =
    label.alignmentWindowHours ?? label.maxAgeHours ?? label.validityWindowHours;
  if (configuredHours != null) return configuredHours * 60 * 60 * 1000;
  const configured =
    options.scopeWindows?.[label.scope] ??
    options.windows?.[label.scope] ??
    options.alignmentWindowMs;
  if (configured != null) return configured;
  return DEFAULT_SCOPE_WINDOWS_MS[label.scope] ?? DEFAULT_ALIGNMENT_WINDOW_MS;
}

export function sampleObservedAt(sample) {
  const checkedAt = sample.cross?.checkedAt;
  return checkedAt && Number.isFinite(Date.parse(checkedAt)) ? checkedAt : sample.collectedAt;
}

function validateLabelScope(label) {
  if (label.metric && label.metric !== label.scope)
    throw new Error(`${label.id}: label metric must match scope`);
  const allowed = label.scope === 'usage' ? usageKinds : anonymityKinds;
  if (!allowed.has(label.expectedKind))
    throw new Error(`${label.id}: ${label.scope} scope cannot label ${label.expectedKind}`);
}

export function validateCorpus(rawSamples, rawLabels) {
  const { samples } = samplesSchema.parse(rawSamples);
  const { labels } = labelsSchema.parse(rawLabels);
  for (const [name, rows] of [
    ['samples', samples],
    ['labels', labels],
  ]) {
    const values = rows.map((row) => row.id);
    if (new Set(values).size !== values.length) throw new Error(`Duplicate ${name} id`);
  }
  for (const sample of samples) {
    const readingIds = new Set();
    const metrics = new Set();
    const reputationProviders = new Set();
    for (const reading of sample.cross?.readings ?? []) {
      const id = `${reading.source}:${reading.id}`;
      const metric = `${reading.source}:${reading.metric}`;
      if (readingIds.has(id) || metrics.has(metric))
        throw new Error(`${sample.id}: Duplicate provider reading`);
      readingIds.add(id);
      metrics.add(metric);
      if (['fraud', 'risk', 'purity', 'blocklist', 'abuse'].includes(reading.metric)) {
        if (reputationProviders.has(reading.source))
          throw new Error(`${sample.id}: Multiple reputation readings from one provider`);
        reputationProviders.add(reading.source);
      }
    }
    for (const key of ['coffee', 'cross']) {
      if (sample.acquisition[key].ok !== (sample[key] != null))
        throw new Error(`${sample.id}: ${key} availability mismatch`);
      if (sample[key] && canonicalIp(sample[key].ip) !== canonicalIp(sample.ip))
        throw new Error(`${sample.id}: ${key} returned the wrong IP`);
    }
    const coffeeUrl = new URL(sample.acquisition.coffee.url);
    const crossUrl = new URL(sample.acquisition.cross.url);
    if (coffeeUrl.protocol !== 'https:' || !coffeeAcquisitionHosts.has(coffeeUrl.hostname))
      throw new Error(`${sample.id}: coffee acquisition URL host is not allowlisted`);
    if (
      !['http:', 'https:'].includes(crossUrl.protocol) ||
      !crossAcquisitionHosts.has(crossUrl.hostname)
    )
      throw new Error(`${sample.id}: cross acquisition URL host is not allowlisted`);
    for (const reading of sample.cross?.readings ?? []) {
      const href = new URL(reading.href);
      const hosts = readingHosts[reading.source];
      if (!hosts || !hostAllowed(href, hosts))
        throw new Error(`${sample.id}: ${reading.source} reading URL host is not allowlisted`);
    }
  }
  for (const label of labels) {
    const url = new URL(label.source.url);
    if (!hostAllowed(url, labelSourceHosts))
      throw new Error(`${label.id}: label source URL host is not allowlisted`);
    validateLabelScope(label);
    if (label.expiresAt && Date.parse(label.expiresAt) <= Date.parse(label.observedAt))
      throw new Error(`${label.id}: invalid label validity window`);
  }
  return { samples, labels };
}

function assess(sample, excluded = []) {
  const excludedSet = new Set(excluded);
  const coffee = excludedSet.has('coffee')
    ? { ip: sample.ip }
    : (sample.coffee ?? { ip: sample.ip });
  const cross = sample.cross
    ? {
        ...sample.cross,
        readings: sample.cross.readings.filter((item) => !excludedSet.has(item.source)),
        unavailable: [
          ...new Set([...sample.cross.unavailable, ...excluded.filter((id) => id !== 'coffee')]),
        ],
      }
    : null;
  return assessQuality(coffee, cross, {
    now: Date.parse(sampleObservedAt(sample)),
  });
}

function scopedObservedKind(result, scope) {
  if (scope === 'anonymity') {
    return anonymityKinds.has(result.kind) ? result.kind : null;
  }
  if (result.publicService) return 'public-service';
  if (usageKinds.has(result.kind)) return result.kind;
  return null;
}

function brief(result) {
  return {
    score: result.score,
    kind: result.kind,
    limited: result.scoreReference,
    evidence: result.evidence,
    scoreStatus: result.scoreStatus,
    missingSources: result.scoreMissingSources,
    scoreProfile: result.scoreProfile,
    publicService: result.publicService ?? null,
  };
}

function sensitivity(result) {
  if (result.scoreStatus === 'unavailable') return null;
  const { indicators, cap, penalties, evidenceCoverage } = result.scoreBreakdown;
  const scored = indicators.filter((item) => item.score != null);
  if (!scored.length) return null;
  const penalty = penalties.reduce((acc, item) => acc * item.factor, 1);
  const saturation = Math.min(1, evidenceCoverage / 0.75);
  // Stress the weighting assumptions; these are not trained alternatives.
  const candidates = [-0.1, -0.05, 0, 0.05, 0.1]
    .map((delta) => {
      const weights = Object.fromEntries(indicators.map((item) => [item.key, item.weight]));
      weights.abuse = Math.max(0, weights.abuse + delta);
      weights.fraud = Math.max(0, weights.fraud - delta);
      let weight = 0;
      let base = 0;
      for (const item of scored) {
        weight += weights[item.key];
        base += weights[item.key] * item.score;
      }
      if (weight <= 0) return null;
      const adjusted = (base / weight) * penalty;
      const uncapped = 60 + saturation * (adjusted - 60);
      return {
        delta,
        score: Math.round(Math.min(Math.max(0, Math.min(100, uncapped)), cap)),
      };
    })
    .filter(Boolean);
  if (!candidates.length) return null;
  return {
    min: Math.min(...candidates.map((x) => x.score)),
    max: Math.max(...candidates.map((x) => x.score)),
    candidates,
  };
}

export function evaluateCorpus(rawSamples, rawLabels, options = {}) {
  const { samples, labels } = validateCorpus(rawSamples, rawLabels);
  const labelsByIp = new Map();
  for (const label of labels) {
    const key = canonicalIp(label.ip);
    const group = labelsByIp.get(key) ?? [];
    group.push(label);
    labelsByIp.set(key, group);
  }
  const rows = samples.map((sample) => {
    const result = assess(sample);
    const captured = Date.parse(sampleObservedAt(sample));
    const labelPool = labelsByIp.get(canonicalIp(sample.ip)) ?? [];
    const candidates = labelPool
      .filter(
        (item) =>
          Math.abs(captured - Date.parse(item.observedAt)) <=
            labelAlignmentWindowMs(item, options) &&
          (!item.expiresAt || captured <= Date.parse(item.expiresAt))
      )
      .sort(
        (left, right) =>
          Math.abs(captured - Date.parse(left.observedAt)) -
          Math.abs(captured - Date.parse(right.observedAt))
      );
    const label = candidates[0] ?? labelPool[0] ?? null;
    const labelAligned = candidates.length > 0;
    const observed = result.sources.some((source) => source.status === 'ready');
    const catalogueBacked =
      !!result.publicService && label?.scope === 'usage' && label.expectedKind === 'public-service';
    const labelStatus = !label
      ? 'unlabelled'
      : !labelAligned
        ? 'time-mismatch'
        : !observed
          ? 'unobserved'
          : catalogueBacked
            ? 'catalogue-backed'
            : 'compared';
    const used = result.sources
      .filter((source) => source.status === 'ready')
      .map((source) => source.id);
    const omissions = used.map((source) => ({
      excluded: [source],
      ...brief(assess(sample, [source])),
    }));
    const relatedFamily = ['ipinfo', 'ip2location', 'scamalytics'].filter((source) =>
      used.includes(source)
    );
    if (relatedFamily.length > 1)
      omissions.push({
        excluded: relatedFamily,
        ...brief(assess(sample, relatedFamily)),
      });
    const numeric = omissions.filter((row) => row.score != null);
    const worstOmission =
      result.score == null
        ? null
        : numeric.reduce(
            (worst, row) =>
              !worst || Math.abs(row.score - result.score) > Math.abs(worst.score - result.score)
                ? row
                : worst,
            null
          );
    return {
      id: sample.id,
      ip: sample.ip,
      collectedAt: sample.collectedAt,
      observedAt: sampleObservedAt(sample),
      ...brief(result),
      label: label ?? null,
      labelStatus,
      observedKind: label ? scopedObservedKind(result, label.scope) : null,
      agreement:
        labelStatus === 'compared'
          ? scopedObservedKind(result, label.scope) === label.expectedKind
          : null,
      catalogueAgreement:
        labelStatus === 'catalogue-backed'
          ? scopedObservedKind(result, label.scope) === label.expectedKind
          : null,
      scoreBreakdown: result.scoreBreakdown,
      sensitivity: sensitivity(result),
      omissions,
      kindStable: omissions.every((row) => row.kind === result.kind),
      worstOmission,
      maxOmissionShift:
        result.score == null || !numeric.length
          ? null
          : Math.max(...numeric.map((row) => Math.abs(row.score - result.score))),
    };
  });
  const compared = rows.filter((row) => row.labelStatus === 'compared');
  const catalogueRows = rows.filter((row) => row.labelStatus === 'catalogue-backed');
  const labelledRows = [...compared, ...catalogueRows];
  const missingLabels = labels
    .filter((label) => !samples.some((sample) => canonicalIp(sample.ip) === canonicalIp(label.ip)))
    .map((label) => label.id);
  return {
    schemaVersion: 1,
    sampleCount: rows.length,
    labelled: labels.length,
    compared: compared.length,
    catalogueBacked: catalogueRows.length,
    catalogueAgreements: catalogueRows.filter((row) => row.catalogueAgreement).length,
    agreements: compared.filter((row) => row.agreement).length,
    disagreements: compared.filter((row) => !row.agreement).map((row) => row.id),
    unobserved: rows.filter((row) => row.labelStatus === 'unobserved').map((row) => row.id),
    timeMismatches: rows.filter((row) => row.labelStatus === 'time-mismatch').map((row) => row.id),
    missingLabels,
    groups: [...new Set(labelledRows.map((row) => row.label.group))],
    classes: [...new Set(labelledRows.map((row) => row.label.expectedKind))],
    calibrationReady: false,
    calibrationLimit:
      'This pilot has no representative, independent labelled train/validation set or numerical risk outcomes. Do not fit or claim calibrated weights.',
    rows,
  };
}

const cell = (value) =>
  String(value ?? '—')
    .replaceAll('|', '\\|')
    .replaceAll('\n', ' ');
export function renderReport(report) {
  const lines = [
    '# IP 质量校准试验',
    '',
    `实现指纹：\`${report.implementationHash}\`。只读取冻结快照；重复运行不请求外网。`,
    '',
    `共 ${report.sampleCount} 条实测快照、${report.labelled} 条官方标签；独立比较 ${report.compared} 条，一致 ${report.agreements} 条，分歧 ${report.disagreements.length} 条。另有 ${report.catalogueBacked} 条已用于生产用途登记，只检查规则一致性（${report.catalogueAgreements} 条一致），不计入独立准确率。未取得结果 ${report.unobserved.length} 条，时间不匹配 ${report.timeMismatches.length} 条，尚未采集 ${report.missingLabels.length} 条。`,
    '',
    `覆盖 ${report.groups.length} 个运营方组、${report.classes.length} 种类别（${report.classes.join('、') || '无'}）。同一运营方多个地址不视为独立验证组。`,
    '',
    '**这是一组用途与稳定性试验，不是准确率基准。尚不具备调参条件；本轮没有据此重新训练权重。** 公共 DNS 标签只证明服务用途，不能证明无代理、无滥用或低风险。无真实标签的目标地址不计入分类一致性。',
    '',
    '| 地址 | 官方用途标签 | 模型类别 | 比较 | 参考分 | 证据有限 | 各指标有效来源数 |',
    '| --- | --- | --- | --- | ---: | --- | --- |',
    ...report.rows.map(
      (row) =>
        `| ${cell(row.ip)} | ${cell(row.label?.expectedKind)} | ${cell(row.kind)} | ${row.labelStatus === 'catalogue-backed' ? '登记规则检查' : row.agreement === null ? cell(row.labelStatus) : row.agreement ? '一致' : '分歧'} | ${row.score == null ? '尚无读数' : `${cell(row.score)}${row.scoreStatus === 'provisional' ? '（估算）' : ''}`} | ${row.limited ? '是' : '否'} | ${Object.values(
          row.evidence
        )
          .map((ids) => ids.length)
          .join('/')} |`
    ),
    '',
    '## 稳定性',
    '',
    '逐一移除可用来源，并额外共同移除可能存在数据家族重叠的 IPinfo/IP2Location/Scamalytics。后者是压力场景，不断言三个服务完全同源。分数缺失不当作 0，也不隐去缺失结果。',
    '当前策略在部分来源缺失时继续按已读证据估算，并单独标明覆盖不足。分数随来源变化的幅度仍需查看，不视为质量真实改善。官方用途登记保持可追溯的服务身份，不增加信誉或匿名票。最初结果与实现指纹保存在 scripts/ip-quality-data/baseline-coverage-v1.json。',
    '',
    '权重敏感性只在滥用与欺诈权重之间转移最多 10 个百分点，保持其余指标系数、罚因子和风险上限；得到的范围不是统计置信区间。',
    '',
    '| 地址 | 移除来源后的最大分差 | 用途/风险类别是否稳定 | 无可用评分的场景数 | 权重变化范围 |',
    '| --- | ---: | --- | ---: | --- |',
    ...report.rows.map(
      (row) =>
        `| ${cell(row.ip)} | ${cell(row.maxOmissionShift)} | ${row.kindStable ? '稳定' : '存在变化'} | ${row.omissions.filter((item) => item.score == null).length}/${row.omissions.length} | ${row.sensitivity ? `${row.sensitivity.min}–${row.sensitivity.max}` : '证据不足'} |`
    ),
    '',
    '## 标签与采样',
    '',
    ...report.rows.map(
      (row) =>
        `- ${row.ip}：采样 ${row.collectedAt}${row.label ? `；标签来自 [${row.label.group}](${row.label.source.url})，核对 ${row.label.source.fetchedAt}。` : '；没有独立用途标签，仅作稳定性观察。'}`
    ),
    '',
    '## 下一步所需证据',
    '',
    '需要不同运营方、地区和时间段的住宅、企业/校园、机房及各类匿名出口真值，并按运营方和时间划分训练/验证集。注册国、ASN、供应商分类不能自行升级为接入用途真值。验证集应冻结；本试验观察到的案例不能再宣称为未见样本。数值风险权重还需要实际风险结果标签，不能只用网络用途分类训练。',
    '',
  ];
  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const options = {
    samples: 'scripts/ip-quality-data/samples.json',
    labels: 'scripts/ip-quality-data/labels.json',
    out: 'docs/ip-quality-calibration-results.md',
    json: 'scripts/ip-quality-data/results.json',
  };
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    if (!(key in options) || !args[i + 1])
      throw new Error(`Unknown or missing argument ${args[i]}`);
    options[key] = args[i + 1];
  }
  const [samples, labels] = await Promise.all([
    readFile(options.samples, 'utf8'),
    readFile(options.labels, 'utf8'),
  ]);
  const report = evaluateCorpus(JSON.parse(samples), JSON.parse(labels));
  const files = [
    'src/views/ip/model/quality.ts',
    'src/views/ip/model/quality-score.ts',
    'src/views/ip/model/quality-policy.ts',
    'src/views/ip/model/public-service.ts',
    'src/views/ip/model/anonymity.ts',
    'src/views/ip/model/verdict.ts',
    'src/views/ip/model/scores.ts',
    'src/views/ip/model/prefix-age.ts',
    'src/views/ip/model/cross-checks.ts',
    'scripts/ip-quality-calibration.mjs',
  ];
  const hash = createHash('sha256');
  for (const file of files) hash.update(file).update(await readFile(file));
  report.implementationHash = hash.digest('hex');
  report.inputs = {
    samples: options.samples,
    labels: options.labels,
    sha256: createHash('sha256').update(samples).update(labels).digest('hex'),
  };
  await writeFile(options.json, JSON.stringify(report, null, 2) + '\n');
  await writeFile(options.out, renderReport(report));
  process.stdout.write(
    `${report.sampleCount} snapshots, ${report.compared} independently labelled comparisons, ${report.disagreements.length} disagreements. ${options.out}\n`
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
