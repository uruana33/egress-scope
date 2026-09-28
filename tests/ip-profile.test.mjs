import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ipProfileFields } from '../src/views/ip/profile-fields.ts';
import { ipProfile } from '../src/views/ip/profile.ts';

const residential = {
  ip: '203.0.113.10',
  trust_score: 95,
  isResidential: true,
  is_datacenter: false,
  is_mobile: false,
  company_type: 'ISP',
  countryCode: 'sg',
  registered_country_code: 'SG',
  is_vpn: false,
  is_proxy: false,
  is_tor: false,
  is_crawler: false,
  is_abuser: false,
  is_bogon: false,
};

test('IP reputation alone never produces scenario stars', () => {
  for (const trust_score of [0, 75, 100])
    assert.equal('scenarios' in ipProfile({ ...residential, trust_score }), false);
});

test('profile explanations highlight actual categories and keep unknown flags distinct', () => {
  const fields = (data) => ipProfileFields(data, ipProfile(data));
  const ordinary = fields(residential);
  assert.equal(ordinary[0].options.find((item) => item.current).label, '家庭住宅 IP');
  assert.equal(ordinary[1].options.find((item) => item.current).label, '网络运营商');
  const publicFields = fields({ ...residential, is_public_service: true });
  assert.equal(publicFields[0].options.find((item) => item.current).label, '公共服务');
  assert.equal(publicFields[2].value, '不适用');
  const conflict = fields({ ...residential, is_datacenter: true });
  assert.equal(conflict[0].options.find((item) => item.current).label, '类型标记冲突');
  const custom = fields({ ...residential, company_type: 'specialized' });
  assert.equal(custom[1].value, 'specialized');
  assert.equal(custom[1].options.find((item) => item.current).label, '其他类型');
  const flags = fields({ ...residential, is_vpn: true, is_proxy: undefined })[3].options;
  assert.equal(flags.find((item) => item.label === 'VPN').status, '已检测到');
  assert.equal(flags.find((item) => item.label === '代理').status, '未知');
  assert.equal(flags.find((item) => item.label === 'Tor').status, '未检测到');
});

test('preferred residential requires evidence beyond a high score', () => {
  assert.equal(ipProfile(residential).grade, '住宅优选');
  assert.equal(ipProfile(residential).level, 'S');
  assert.equal(ipProfile(residential).checks.filter((check) => check.passed === true).length, 5);
  for (const changes of [
    { is_datacenter: true },
    { is_datacenter: undefined },
    { isResidential: undefined },
    { company_type: 'hosting' },
    { registered_country_code: 'US' },
    { registered_country_code: undefined },
    { trust_score: 89 },
    { is_mobile: true },
    { is_proxy: undefined },
    { is_proxy: true },
    { is_abuser: true },
    { intelligence: { threats: ['reported abuse'] } },
  ])
    assert.equal(ipProfile({ ...residential, ...changes }).preferred, false);
});

test('evidence separates missing fields, type mismatches and real score bands', () => {
  const missing = ipProfile({ ip: '203.0.113.10' });
  assert.ok(missing.checks.every((check) => check.passed === null));
  assert.equal(missing.scoreBand, null);
  const hosting = ipProfile({
    ...residential,
    isResidential: false,
    is_datacenter: true,
    company_type: 'hosting',
    trust_score: 100,
  });
  assert.equal(hosting.level, 'A');
  assert.equal(hosting.checks[0].passed, false);
  assert.equal(hosting.checks[1].passed, false);
  assert.equal(hosting.checks.filter((check) => check.passed).length, 3);
  for (const [score, band] of [
    [0, 0],
    [44, 0],
    [45, 1],
    [74, 1],
    [75, 2],
    [89, 2],
    [90, 3],
    [100, 3],
  ])
    assert.equal(ipProfile({ ...residential, trust_score: score }).scoreBand, band);
});

test('risk notices remain visible at a perfect score and distinguish network flags', () => {
  assert.equal(ipProfile(residential).risk, null);
  for (const flag of ['is_abuser', 'is_bogon']) {
    const p = ipProfile({ ...residential, trust_score: 100, [flag]: true });
    assert.equal(p.risk.severity, 'danger');
    assert.equal(p.level, null);
  }
  const threats = ipProfile({
    ...residential,
    trust_score: 100,
    intelligence: { threats: ['abuse'] },
  });
  assert.equal(threats.risk.severity, 'danger');
  assert.ok(threats.risk.flags.includes('abuse'));
  for (const flag of ['is_proxy', 'is_vpn', 'is_tor', 'is_crawler']) {
    assert.equal(ipProfile({ ...residential, [flag]: true }).risk.severity, 'notice');
  }
  assert.equal(ipProfile({ ...residential, trust_score: 44 }).risk.severity, 'danger');
  assert.equal(ipProfile({ ...residential, trust_score: 41, is_public_service: true }).risk, null);
  assert.equal(ipProfile({ ip: '203.0.113.10' }).risk, null);
});

test('object threat records render as labels throughout the report', () => {
  const data = {
    ...residential,
    intelligence: {
      threats: [{ label: 'Known abuse', severity: 'high' }, 'Proxy record'],
    },
  };
  const profile = ipProfile(data);
  assert.deepEqual(profile.risk.flags, ['Known abuse', 'Proxy record']);
  assert.ok(profile.risk.flags.every((flag) => typeof flag === 'string'));

  const fields = ipProfileFields(data, profile);
  assert.equal(fields[3].options.at(-1).description, 'Known abuse · Proxy record');
});

test('informational mobile records do not trigger risk notices or one-star ratings', () => {
  const data = {
    ...residential,
    is_mobile: true,
    intelligence: { threats: [{ label: '移动蜂窝', severity: 'info' }] },
  };
  const profile = ipProfile(data);
  assert.equal(profile.risk, null);

  const note = ipProfileFields(data, profile)[3].options.at(-1);
  assert.equal(note.description, '移动蜂窝');
  assert.equal(note.status, '仅信息');
  assert.equal(note.current, false);
});

test('public services and conflicting flags never receive residential tiers', () => {
  const publicService = ipProfile({ ...residential, is_public_service: true });
  assert.equal(publicService.grade, '公共服务网络');
  assert.equal(publicService.level, null);
  assert.equal(publicService.checks[0].value, '公共服务');
  assert.equal(publicService.checks[2].value, '待确认');
  assert.equal(ipProfile({ ...residential, is_datacenter: true }).grade, '类型待确认');
});

test('missing values remain unknown and scores stay within their scale', () => {
  const missing = ipProfile({ ip: '203.0.113.10' });
  assert.equal(missing.grade, '信息不足');
  assert.equal(missing.level, null);
  assert.equal(missing.checks[0].value, '未知');
  assert.equal(missing.checks[3].value, '缺少 6 项数据');
  for (const score of [undefined, null, NaN, Infinity, -1, 101]) {
    const profile = ipProfile({ ...residential, trust_score: score });
    assert.equal(profile.score, null);
    assert.equal(profile.preferred, false);
  }
});

test('tier boundaries and missing evidence do not imply top configuration', () => {
  const hosting = {
    ...residential,
    isResidential: false,
    is_datacenter: true,
    company_type: 'hosting',
  };
  for (const [score, level] of [
    [0, 'C'],
    [74, 'C'],
    [75, 'B'],
    [89, 'B'],
    [90, 'A'],
    [100, 'A'],
  ]) {
    assert.equal(ipProfile({ ...hosting, trust_score: score }).level, level);
  }
  for (const changes of [
    { is_proxy: true },
    { is_proxy: undefined },
    { company_type: undefined },
    { trust_score: null },
    { is_public_service: true },
    { isResidential: true },
  ]) {
    assert.equal(ipProfile({ ...hosting, trust_score: 100, ...changes }).level, null);
  }
});

test('hosting tiers follow score boundaries without ranking company sectors', () => {
  const hosting = {
    ...residential,
    isResidential: false,
    is_datacenter: true,
    company_type: 'hosting',
  };
  for (const [score, expected] of [
    [0, '信誉偏低'],
    [44, '信誉偏低'],
    [45, '信誉一般'],
    [74, '信誉一般'],
    [75, '信誉良好'],
    [89, '信誉良好'],
    [90, '高信誉机房'],
    [100, '高信誉机房'],
  ]) {
    assert.equal(ipProfile({ ...hosting, trust_score: score }).grade, expected);
  }
  assert.equal(ipProfile({ ...hosting, company_type: 'government' }).grade, '高信誉机房');
  assert.equal(ipProfile({ ...hosting, is_vpn: true }).grade, '存在网络标记');
});
