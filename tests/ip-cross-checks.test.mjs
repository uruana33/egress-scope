import assert from 'node:assert/strict';
import { test } from 'node:test';

import { crossChecks } from '../src/views/ip/model/cross-checks.ts';
import { displayCrossReadings } from '../src/views/ip/model/cross-intel.ts';
import { localScores, parseAbuseRaw } from '../src/views/ip/model/scores.ts';

test('cross-checks open the queried IP on each site, never a domain or ASN page', () => {
  const checks = crossChecks('74.120.253.118');
  assert.deepEqual(
    checks.map((item) => [item.id, item.href]),
    [
      ['ipinfo', 'https://ipinfo.io/74.120.253.118'],
      ['ip2location', 'https://www.ip2location.io/74.120.253.118'],
      ['ipapi', 'https://ip-api.com/#74.120.253.118'],
      [
        'ipqs',
        'https://www.ipqualityscore.com/free-ip-lookup-proxy-vpn-test/lookup/74.120.253.118',
      ],
      ['scamalytics', 'https://scamalytics.com/ip/74.120.253.118'],
      ['abuseipdb', 'https://www.abuseipdb.com/check/74.120.253.118'],
      ['ippure', 'https://ippure.com/?ip=74.120.253.118'],
      ['proxycheck', 'https://proxycheck.io/v3/74.120.253.118'],
      [
        'dnsbl',
        'https://mxtoolbox.com/SuperTool.aspx?action=blacklist%3a74.120.253.118&run=toolpage',
      ],
      ['torexit', 'https://check.torproject.org/torbulkexitlist'],
      ['ipregistry', 'https://ipregistry.co/74.120.253.118'],
    ]
  );
});

test('each outbound link is named by its distinctive metric, not only the brand', () => {
  const checks = crossChecks('1.1.1.1');
  assert.deepEqual(
    checks.map((item) => [item.id, item.metric]),
    [
      ['ipinfo', '隐私检测'],
      ['ip2location', '代理类型'],
      ['ipapi', '代理 / 机房'],
      ['ipqs', '欺诈分'],
      ['scamalytics', '欺诈分'],
      ['abuseipdb', '滥用置信度'],
      ['ippure', '纯净度'],
      ['proxycheck', '代理 / VPN / Tor'],
      ['dnsbl', '滥用黑名单'],
      ['torexit', '官方出口名单'],
      ['ipregistry', '安全旗标'],
    ]
  );
});

test('IPv6 addresses are encoded so the query string stays one token', () => {
  const href = crossChecks('2001:db8::1').find((item) => item.id === 'ippure')?.href;
  assert.equal(href, 'https://ippure.com/?ip=2001%3Adb8%3A%3A1');
});

test('Coffee abuse strings split the number from the band', () => {
  assert.deepEqual(parseAbuseRaw('0 (Very Low)'), {
    score: 0,
    band: 'Very Low',
  });
  assert.deepEqual(parseAbuseRaw(''), { score: null, band: undefined });
});

test('local scores print Coffee answers instead of empty outbound cells', () => {
  const items = localScores({
    ip: '74.120.253.118',
    trust_score: 83,
    abuser_score: '0 (Very Low)',
    intelligence: { abuser_level: 'low', abuser_score_raw: '0 (Very Low)' },
    is_datacenter: true,
    asn_kind: 'residential',
    company_type: 'hosting',
    is_vpn: false,
    is_proxy: false,
    is_tor: false,
    is_crawler: false,
    is_abuser: false,
    countryCode: 'US',
    registered_country_code: 'US',
  });
  const byId = Object.fromEntries(items.map((item) => [item.id, item]));
  assert.equal(items.length, 6);
  assert.ok(items.every((item) => item.value !== '去查看'));
  assert.equal(byId.trust.value, '83');
  assert.equal(byId.trust.tone, 'good');
  assert.match(byId.trust.hint, /越高越好/);
  assert.equal(byId.abuse.value, '0');
  assert.equal(byId.abuse.tone, 'good');
  assert.match(byId.abuse.hint, /越高越危险/);
  assert.equal(byId.usage.value, '存在分歧');
  assert.equal(byId.origin.value, '注册国与定位国一致');
  assert.equal(byId.privacy.value, '未检测到');
  assert.equal(byId.kind.value, 'hosting / residential');
  assert.equal(byId.kind.tone, 'warn');
});

test('cross readings keep the source name and outbound href on the cell', () => {
  const [item] = displayCrossReadings([
    {
      id: 'proxycheck-risk',
      source: 'proxycheck',
      metric: 'risk',
      value: '0',
      hint: '',
      tone: 'good',
      href: 'https://proxycheck.io/v3/74.120.253.118',
    },
  ]);
  assert.equal(item.label, '风险分');
  assert.equal(item.source, 'proxycheck.io');
  assert.equal(item.value, '0');
  assert.match(item.hint, /越高越危险/);
  assert.equal(item.href, 'https://proxycheck.io/v3/74.120.253.118');
  assert.equal(item.kind, 'cross');
});

test('IPPure purity stays a high-is-better reading with a source link', () => {
  const [item] = displayCrossReadings([
    {
      id: 'ippure-purity',
      source: 'ippure',
      metric: 'purity',
      value: '60',
      hint: '',
      tone: 'warn',
      href: 'https://ippure.com/?ip=1.1.1.1',
    },
  ]);
  assert.equal(item.label, '纯净度');
  assert.equal(item.source, 'IPPure');
  assert.equal(item.value, '60');
  assert.equal(item.hint, '越高越好');
  assert.equal(item.href, 'https://ippure.com/?ip=1.1.1.1');
});

test('IP-API bundled proxy is shown as 匿名出口（未分类型）', () => {
  const [item] = displayCrossReadings([
    {
      id: 'ipapi-proxy',
      source: 'ipapi',
      metric: 'proxy',
      value: 'Anonymous',
      hint: 'Comcast',
      tone: 'warn',
      href: 'https://ip-api.com/#74.120.253.118',
    },
  ]);
  assert.equal(item.value, '匿名出口（未分类型）');
});

test('legacy flattened privacy No remains incomplete', () => {
  const [item] = displayCrossReadings([
    {
      id: 'ipinfo-privacy',
      source: 'ipinfo',
      metric: 'privacy',
      value: 'No',
      hint: '',
      tone: 'good',
      href: 'https://ipinfo.io/74.120.253.118',
    },
  ]);
  assert.equal(item.value, '匿名检测不完整');
});
