import { useEffect } from 'react';

import { NavLink } from 'react-router-dom';

import { t } from '@/i18n';

const UPDATED = '2026-09-26';

const terms = [
  {
    title: t('服务范围'),
    body: t(
      '本站提供 IP 与域名查询、出口诊断、AI 与站点探测、服务状态和 WebRTC 对照，以及无需密钥的公开 API。'
    ),
  },
  {
    title: t('合理使用'),
    body: t(
      '请仅对你有权检测的目标使用本工具。请勿利用本站从事违法活动、干扰第三方服务、绕过访问限制或滥用 API。'
    ),
  },
  {
    title: t('API 与请求限制'),
    body: t(
      '公开 API 不需要密钥，按请求 IP 限流。收到 429 请降低频率后重试，不要轮换 IP 绕过。浏览器跨站调用受同源限制。'
    ),
  },
  {
    title: t('检测结果的含义'),
    body: t(
      '延迟和 HTTP 响应不是 ICMP Ping，也不能证明某个 AI 账号能登录或对话。出口 IP 只描述那一次请求的路径。质量分是多家来源按同一公式合成的参考值，不是任何平台的官方判定。'
    ),
  },
  {
    title: t('结果与可用性'),
    body: t(
      '检测结果受网络、浏览器限制和第三方数据影响，仅供参考，不构成安全性、账号可用性或服务持续可用的保证。服务可能因维护、限流或上游故障而中断。'
    ),
  },
  {
    title: t('第三方服务与开源许可'),
    body: t(
      '点开第三方链接或走他们的接口，同时遵守对方条款。本站源码按仓库中的 AGPL-3.0 许可使用。'
    ),
  },
  {
    title: t('服务调整'),
    body: t(
      '本站可能调整功能、数据源和限流规则。使用前请查阅当前页面说明；重要结果请通过相关服务的官方渠道核实。'
    ),
  },
];

const privacySources = [
  {
    use: t('归属与出口'),
    parties: 'ipwho.is · IP.SB · ipify',
  },
  {
    use: t('信誉与用途'),
    parties:
      'Net.Coffee · IPinfo · IP-API · IP2Location · IPPure · proxycheck.io · Scamalytics · DNSBL · Tor 出口名单 · IPregistry',
  },
  {
    use: t('只提供外链'),
    parties: t(
      'IPQualityScore 与 AbuseIPDB 由你点开后在对方网站查询；部署方配置 API key 后才会自动代查。'
    ),
  },
  {
    use: t('全球延迟'),
    parties: 'Globalping',
  },
  {
    use: t('域名与 IP 注册'),
    parties: 'RDAP（rdap.org / IANA）',
  },
  {
    use: t('站点图标'),
    parties: t('经本站转发的 DuckDuckGo 图标'),
  },
  {
    use: t('服务状态接口'),
    parties: t('各厂商公开状态页'),
  },
  {
    use: t('WebRTC STUN'),
    parties: t(
      '默认连接 Google 与 Cloudflare 的 STUN。检测结束后仅把公网 ICE 候选发回本站对照，不含局域网地址。'
    ),
  },
  {
    use: t('直连探测'),
    parties: t('出口、AI 与站点探测由浏览器直连目标，对方能看到该连接的出口 IP。'),
  },
];

const privacy = [
  {
    title: t('访问时本站会看到什么'),
    body: t(
      '托管服务会处理请求 IP 和必要的请求信息，并用来限流。采样日志的范围和保留时间取决于部署配置。'
    ),
  },
  {
    title: t('留在这台浏览器里的'),
    body: t(
      '主题、语言、隐藏 IP 开关，以及查询历史（每类最近 10 条成功记录）。部分检测页还会在本机留下最近出口记录。查询地址也可能出现在浏览器自己的历史里。可在浏览器的网站数据设置中清除。清除本机数据不会删除第三方或托管侧的记录。'
    ),
  },
  {
    title: t('查询会发给谁'),
    body: t('具体请求取决于你打开的功能和查询目标。'),
    sources: true,
  },
  {
    title: t('本站不会做的'),
    body: t(
      '不要求登录。不申请摄像头、麦克风或定位。WebRTC 页只建立数据通道。不为广告建立跨站档案。'
    ),
  },
  {
    title: t('分享报告'),
    body: t(
      '你点击生成分享链接后，本站只保存你提交的出口摘要（两侧 IP、是否一致、质量分、特征标记和可选备注），默认 30 天（可选 7 或 90 天）后自动删除。不保存完整浏览器指纹，也不静默上报真实 ISP IP。'
    ),
  },
];

export default function PolicyPage({ page }: { page: 'terms' | 'privacy' }) {
  const title = page === 'terms' ? t('使用条款') : t('隐私政策');
  useEffect(() => {
    document.title = `${title} - ${t('出口观测台')}`;
  }, [title]);

  const sections = page === 'terms' ? terms : privacy;

  return (
    <article className="policy-doc">
      <nav className="policy-switch" aria-label={t('站点政策')}>
        <NavLink to="/terms">{t('使用条款')}</NavLink>
        <NavLink to="/privacy">{t('隐私政策')}</NavLink>
      </nav>
      <header className="policy-mast">
        <h1>{title}</h1>
        <p className="policy-lede">
          {page === 'terms'
            ? t('使用本站即表示你同意按当前页面使用。检测结果只供参考。')
            : t(
                '本站不设账号、不做广告追踪。查询会把目标发给第三方；你的浏览器直连的站点能看到那次连接的出口 IP。'
              )}
        </p>
        <p className="policy-meta">
          <time dateTime={UPDATED}>
            {t('最近更新')} {UPDATED}
          </time>
        </p>
      </header>
      {sections.map((section) => (
        <section key={section.title} className="policy-section">
          <h2>{section.title}</h2>
          <p>{section.body}</p>
          {'sources' in section && section.sources ? (
            <dl className="policy-sources">
              {privacySources.map((row) => (
                <div key={row.use}>
                  <dt>{row.use}</dt>
                  <dd>{row.parties}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </section>
      ))}
    </article>
  );
}
