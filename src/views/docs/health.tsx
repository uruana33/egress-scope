import { useEffect } from 'react';

import { Link } from 'react-router-dom';

import { CopyButton } from '@/components/copy-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { t } from '@/i18n';

import './docs-health.css';
import { DocsNav } from './nav';

const ORIGIN = globalThis.location?.origin ?? '';
const CURL_TEXT = `curl -sS "${ORIGIN}/api/ip/health?ip=1.1.1.1&format=text"`;
const CURL_JSON = `curl -sS "${ORIGIN}/api/ip/health?ip=1.1.1.1"`;

const TEXT_SAMPLE = `IP health
ip: 1.1.1.1
score: 41
status: poor
country: Australia
city: South Brisbane
isp: Cloudflare, Inc.
asn: 13335
datacenter: true
vpn: false
proxy: false
tor: false`;

const CURL_SELF = `curl -sS "${ORIGIN}/api/ip/health" | jq '{ip,score,status,isp,flags}'`;
const CURL_BATCH = `curl -sS "${ORIGIN}/api/ip/health?ip=8.8.8.8"`;
const CURL_CLASH = `# 示例：读取质量分，阈值请自限
SCORE=$(curl -sS "${ORIGIN}/api/ip/health?ip=$NODE_IP" | jq -r .score)`;

const JSON_SAMPLE = `{
  "ip": "1.1.1.1",
  "checked_at": "2026-09-26T00:57:31.406Z",
  "score": 41,
  "status": "poor",
  "country": "Australia",
  "region": "Queensland",
  "city": "South Brisbane",
  "isp": "Cloudflare, Inc.",
  "asn": 13335,
  "flags": {
    "residential": false,
    "datacenter": true,
    "mobile": false,
    "vpn": false,
    "proxy": false,
    "tor": false,
    "crawler": false,
    "abuser": false
  }
}`;

const PARAMS: Array<{ name: string; desc: string }> = [
  {
    name: 'ip',
    desc: t('可选。要检测的 IPv4／IPv6 地址；省略时检测访客自身出口（需公网部署环境）。'),
  },
  {
    name: 'format',
    desc: t('可选。json（默认）或 text，text 适合终端直接阅读。'),
  },
];

const FIELDS: Array<{ name: string; desc: string }> = [
  {
    name: 'score / status',
    desc: t(
      '参考分（0–100）与档位（good / moderate / poor）。越高通常画像越「干净」。字段名已冻结，新增字段只追加。'
    ),
  },
  {
    name: 'country / region / city / isp / asn',
    desc: t('归属与运营商信息，用于核对出口位置是否符合预期。'),
  },
  {
    name: 'datacenter / residential / mobile',
    desc: t('网络用途画像：机房、家庭宽带或移动网络。'),
  },
  {
    name: 'vpn / proxy / tor / abuser / crawler',
    desc: t('特征标记；命中 ≠ 恶意，但可能影响部分平台的验证结果。'),
  },
];

function CodeBlock({ code, label }: { code: string; label: string }) {
  return (
    <figure className="docs-code">
      <figcaption>
        <span>{label}</span>
        <CopyButton value={code} className="size-6 text-primary" />
      </figcaption>
      <pre>
        <code>{code}</code>
      </pre>
    </figure>
  );
}

export default function DocsHealthPage() {
  useEffect(() => {
    document.title = t('IP 健康报告 API · 出口观测台');
  }, []);
  return (
    <div className="docs-health space-y-3">
      <DocsNav current="/docs/health" />
      <header className="page-header">
        <div className="page-header-text">
          <h1>{t('一行 curl，查看出口画像')}</h1>
          <p>{t('返回质量分与机房／代理等特征标记，便于脚本化排查与节点切换后的对比。')}</p>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t('请求')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <CodeBlock code={CURL_TEXT} label={t('终端文本输出')} />
          <CodeBlock code={CURL_JSON} label={t('JSON 输出')} />
          <dl className="docs-fields">
            {PARAMS.map((param) => (
              <div key={param.name}>
                <dt>
                  <code>{param.name}</code>
                </dt>
                <dd>{param.desc}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t('输出示例（1.1.1.1）')}</CardTitle>
        </CardHeader>
        <CardContent className="docs-samples">
          <CodeBlock code={TEXT_SAMPLE} label="format=text" />
          <CodeBlock code={JSON_SAMPLE} label="format=json" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t('字段说明')}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="docs-fields">
            {FIELDS.map((field) => (
              <div key={field.name}>
                <dt>
                  <code>{field.name}</code>
                </dt>
                <dd>{field.desc}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t('一行检查当前出口')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <CodeBlock code={CURL_SELF} label={t('当前出口')} />
          <CodeBlock code={CURL_BATCH} label={t('指定 IP（脚本批量）')} />
          <p className="small muted">
            {t(
              'score／status 为参考值，不代表平台官方风控；flags.* 为机房／代理等特征标记。字段名保持兼容，只追加不改名。robots.txt 禁止索引 /api/，不影响 curl 与脚本调用。'
            )}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t('给 Clash／节点检测脚本')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <CodeBlock code={CURL_CLASH} label={t('读取质量分')} />
          <p className="small muted">
            {t('示例读取 score。阈值请自行限制，脚本使用字段名 score。')}{' '}
            <Link to="/docs/clash">{t('Clash 健康检查怎么看出口')}</Link>
          </p>
        </CardContent>
      </Card>

      <p className="small muted docs-health-note">
        {t(
          '更换节点后再次请求，即可对比 score 与 flags 的变化。质量分是多来源合成的参考值，不代表任何平台的官方判定。'
        )}{' '}
        <Link to="/network/ip">{t('在网页中查看 IP 质量')}</Link>
      </p>
    </div>
  );
}
