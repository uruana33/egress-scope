import { t } from '@/i18n';

import { type CoffeeIp, coffeeThreatLabels } from './coffee.ts';
import type { ipProfile } from './profile';

type Option = {
  label: string;
  description: string;
  current?: boolean;
  status?: string;
};
type Field = {
  label: string;
  value: string;
  detail?: string;
  options: Option[];
  tone?: 'success' | 'warning' | 'danger' | 'info';
  special?: boolean;
};

export function ipProfileFields(data: CoffeeIp, profile: ReturnType<typeof ipProfile>): Field[] {
  const threats = coffeeThreatLabels(data);
  const riskThreats = coffeeThreatLabels(data, true);
  const typeOptions = [
    [
      t('家庭住宅 IP'),
      t('分配给家庭或个人宽带用户的地址。住宅标记不保证独享，也不排除被用作代理。'),
    ],
    [t('移动网络'), t('由蜂窝移动网络提供的地址，可能由多个设备共享，连接变化时出口可能改变。')],
    [
      t('数据中心'),
      t('服务器托管、云服务、CDN 或 IP 租赁等网络的地址。适合部署服务，不等于存在风险。'),
    ],
    [t('公共服务'), t('公共 DNS、CDN 等服务地址，可能使用任播，不能按普通个人上网出口理解。')],
    [t('类型标记冲突'), t('数据源同时返回住宅和数据中心标记，暂不能确认具体用途。')],
    [t('未知'), t('未返回足够的类型标记，不能把缺失数据当成住宅或安全证明。')],
  ];
  const companies = [
    ['isp', t('网络运营商'), t('提供互联网接入或网络传输服务的组织；旗下地址不一定都是家庭宽带。')],
    ['hosting', t('托管服务商'), t('经营服务器托管、云计算、CDN 等业务的组织。')],
    ['business', t('商业企业'), t('企业自用网络或其他商业组织，不能仅据此判断住宅或机房。')],
    ['education', t('教育机构'), t('学校、大学和科研教育组织使用的网络。')],
    ['government', t('政府机构'), t('政府及公共行政组织使用的网络，不代表特殊访问权限。')],
    ['banking', t('金融机构'), t('银行或金融组织使用的网络，不代表更高信誉或投资安全。')],
    ['other', t('其他类型'), t('数据源返回了未收录的业务类型，保留原始值，不作高低判断。')],
    ['unknown', t('未知'), t('数据源未提供厂商类型。')],
  ];
  const rawCompany = data.company_type?.trim().toLowerCase();
  const companyKey = !rawCompany
    ? 'unknown'
    : companies.some(([key]) => key === rawCompany)
      ? rawCompany
      : 'other';
  const country = data.countryCode?.trim().toUpperCase();
  const registered = data.registered_country_code?.trim().toUpperCase();
  const registration = data.is_public_service
    ? 'na'
    : !country || !registered
      ? 'unknown'
      : country === registered
        ? 'same'
        : 'different';
  const registrationOptions = [
    ['same', t('注册地一致'), t('定位国家与注册国家一致，可作归属参考，但不能单独证明原生线路。')],
    ['different', t('注册地不同'), t('可能来自跨境运营、地址调配或数据库差异，不等于有风险。')],
    ['unknown', t('待确认'), t('缺少注册国家或定位国家，暂不能比较。')],
    ['na', t('不适用'), t('公共服务可能在多个地区提供服务，不用单点国家比较判断原生性。')],
  ];
  const flags: [string, string, boolean | undefined][] = [
    ['VPN', t('被数据源识别为 VPN 出口；属于网络用途标记，不等同于恶意流量。'), data.is_vpn],
    [t('代理'), t('被识别为代理出口，可能影响网站的访问验证。'), data.is_proxy],
    ['Tor', t('被识别为 Tor 出口，部分服务可能限制这类匿名网络。'), data.is_tor],
    [t('爬虫标记'), t('被识别为自动化抓取或爬虫相关地址，需要结合实际用途判断。'), data.is_crawler],
    [t('滥用标记'), t('数据源记录到滥用活动或相关黑名单信号，建议核实。'), data.is_abuser],
    ['Bogon', t('私有、保留或尚未分配等不应出现在公共互联网路由中的地址。'), data.is_bogon],
  ];
  const fields: Field[] = [
    {
      label: t('IP 类型'),
      value: profile.checks[0].value,
      detail: t('这里表示网络用途，IPv4 / IPv6 表示地址协议，两者是不同维度。'),
      options: typeOptions.map(([label, description]) => ({
        label,
        description,
        current: label === profile.checks[0].value,
      })),
    },
    {
      label: t('厂商类型'),
      value: profile.checks[1].value,
      detail: t('当前厂商：{0}', [data.company_name || data.isp || t('未知')]),
      options: companies.map(([key, label, description]) => ({
        label,
        description,
        current: key === companyKey,
      })),
    },
    {
      label: t('注册地对照'),
      value: registrationOptions.find(([key]) => key === registration)![1],
      detail: t('定位国家：{0}；注册国家：{1}。国家一致不等于已验证原生线路。', [
        data.country || country || t('未知'),
        data.registered_country || registered || t('未知'),
      ]),
      options: registrationOptions.map(([key, label, description]) => ({
        label,
        description,
        current: key === registration,
      })),
    },
    {
      label: t('网络标记'),
      value: profile.checks[3].value,
      detail: t('未检出只表示当前数据源没有返回该标记，未知表示缺少数据。'),
      options: [
        ...flags.map(([label, description, value]) => ({
          label,
          description,
          current: value === true,
          status: value === true ? t('已检测到') : value === false ? t('未检测到') : t('未知'),
        })),
        {
          label: t('其他情报'),
          description: threats.length
            ? threats.join(' · ')
            : t('其他威胁情报记录，与上述六项网络标记分别展示。'),
          status: riskThreats.length
            ? t('已检测到')
            : threats.length
              ? t('仅信息')
              : data.intelligence?.threats
                ? t('未检测到')
                : t('未知'),
          current: riskThreats.length > 0,
        },
      ],
    },
  ];
  fields[0].tone = data.isResidential && data.is_datacenter ? 'warning' : 'info';
  fields[1].tone = 'info';
  fields[1].special = ['education', 'government', 'banking'].includes(companyKey);
  fields[2].tone = registration === 'same' ? 'success' : 'info';
  fields[3].tone =
    profile.risk?.severity === 'danger'
      ? 'danger'
      : profile.risk
        ? 'warning'
        : profile.checks[3].passed
          ? 'success'
          : 'info';
  return fields;
}
