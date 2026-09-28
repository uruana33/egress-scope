import { Link } from 'react-router-dom';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { t } from '@/i18n';

import { DocArticle } from './article';

function Related({ links }: { links: Array<{ to: string; label: string }> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{t('接着看')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="docs-list">
          {links.map((link) => (
            <li key={link.to}>
              <Link to={link.to}>{link.label}</Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function EgressIpDoc() {
  const title = t('出口 IP 检测 · 国内／海外对照 · 出口观测台');
  const description = t(
    '看当前流量从哪条公网 IP 出去，国内和海外是否同一条，以及质量分和机房／代理标记。用于排查分流，不代表平台过审。'
  );
  return (
    <DocArticle
      path="/docs/egress-ip"
      title={title}
      description={description}
      heading={t('出口 IP 检测看哪几项')}>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t('先分开两件事')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="docs-list">
            <li>
              {t(
                '出口地址：国内探针和海外探针各自看到哪条公网 IP。地址不同，只说明这次观测到不是同一条出口。'
              )}
            </li>
            <li>
              {t(
                '质量画像：分数，以及机房、住宅、代理、VPN 等标记。用来认这个出口像什么，不是任何平台的官方判定。'
              )}
            </li>
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t('别读反')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="docs-list">
            <li>
              {t(
                '两次都是同一个地址，可能是都走了代理，也可能都没走。要核对具体网站，用分流出口页。'
              )}
            </li>
            <li>{t('分数高不代表账号可用，分数低也不等于被封。')}</li>
          </ul>
        </CardContent>
      </Card>
      <Related
        links={[
          { to: '/', label: t('打开首页做国内／海外对照') },
          { to: '/network/egress', label: t('按网站看分流出口') },
          { to: '/network/ip', label: t('查看 IP 质量与归属') },
          { to: '/share', label: t('生成可分享的出口报告') },
          { to: '/docs/health', label: t('用一行 curl 看质量分') },
        ]}
      />
    </DocArticle>
  );
}

export function DnsLeakDoc() {
  const title = t('DNS 泄露检测 · 解析出口 · 出口观测台');
  const description = t(
    'DNS 泄露是解析请求没走预期出口。说明它和网页出口、WebRTC 的差别，以及本站 DNS 出口页怎么看。'
  );
  return (
    <DocArticle
      path="/docs/dns-leak"
      title={title}
      description={description}
      heading={t('DNS 泄露是解析走了另一条出口')}>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t('三项不是一回事')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="docs-list">
            <li>{t('网页出口：HTTP 从哪出去。首页和分流出口页看这个。')}</li>
            <li>
              {t(
                'DNS 出口：解析请求落到哪。DNS 页按探测来源分组，HTTP 出口只作对照，不代表每个解析请求都绑在那个 IP 上。'
              )}
            </li>
            <li>{t('WebRTC：浏览器的 UDP 候选，和域名解析不是同一项。')}</li>
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t('看的时候')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="docs-list">
            <li>{t('解析出口和你预期的代理出口不一致时，再查这些域名是不是被规则直连了。')}</li>
            <li>
              {t(
                'fake-ip 或 redir-host 改变的是客户端怎么处理解析。最后仍要看解析器实际出去的地址。'
              )}
            </li>
            <li>{t('本站不读取客户端配置，只报告这次探测打到的解析出口。')}</li>
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t('和分享报告的关系')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="docs-list">
            <li>
              {t(
                '首页生成的分享快照记录那次国内／海外出口对照和质量分。DNS、WebRTC 若没写进摘要，报告里会标成未检测。'
              )}
            </li>
            <li>
              {t(
                '未检测不是没有泄露。要给别人看解析结果，打开 DNS 页再说；/r/ 链接给的是当时的出口摘要。'
              )}
            </li>
          </ul>
        </CardContent>
      </Card>
      <Related
        links={[
          { to: '/dns', label: t('打开 DNS 解析出口') },
          { to: '/webrtc', label: t('对照 WebRTC 与网页出口') },
          { to: '/network/egress', label: t('按网站看分流出口') },
          { to: '/share', label: t('生成可分享的出口报告') },
        ]}
      />
    </DocArticle>
  );
}

export function ClashHealthDoc() {
  const title = t('Clash 健康检查 · 节点出口质量 · 出口观测台');
  const description = t(
    '用出口观测台看 Clash 节点的公网出口和质量分。不读取本地配置，也不代替客户端自带的连通性探测。'
  );
  return (
    <DocArticle
      path="/docs/clash"
      title={title}
      description={description}
      heading={t('Clash 节点健康，先看出口再看分数')}>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t('两种查法')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="docs-list">
            <li>{t('浏览器走这个节点时，打开首页看国内／海外出口和质量分。')}</li>
            <li>
              {t(
                '已经知道节点的公网 IP 时，用健康检查 API 把 ip 传进去。脚本读 score，阈值自己定。'
              )}
            </li>
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t('不要混在一起')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="docs-list">
            <li>
              {t(
                '客户端健康检查多半只说明节点能不能连上。延迟低不代表质量分高，URL 通了也不代表分流按规则走。'
              )}
            </li>
            <li>{t('本站不登录 Clash，也不读取配置文件。')}</li>
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t('丢到群里')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="small muted">
            {t(
              '测完点「复制分享文案」，得到一段说明和 /r/ 报告链接。对方打开的是当时的摘要，不是你的实时流量。'
            )}
          </p>
        </CardContent>
      </Card>
      <Related
        links={[
          { to: '/', label: t('打开首页做国内／海外对照') },
          { to: '/network/egress', label: t('核对分流是否落到预期出口') },
          { to: '/docs/health', label: t('健康检查 API 与 curl 示例') },
          { to: '/share', label: t('生成可分享的出口报告') },
        ]}
      />
    </DocArticle>
  );
}
