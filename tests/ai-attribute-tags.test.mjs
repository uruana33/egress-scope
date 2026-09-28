import assert from 'node:assert/strict';
import { test } from 'node:test';

import { attributeTags, regionTag } from '../src/views/ai/attribute-tags.ts';
import { adaptCoffee } from '../src/views/ip/coffee.ts';

test('partial negative risk fields cannot certify no proxy', () => {
  for (const fields of [
    {},
    { is_vpn: false },
    { is_proxy: false, is_tor: false },
    { is_abuser: false },
  ]) {
    const data = adaptCoffee({ ip: '203.0.113.1', ...fields });
    const tags = attributeTags(data.coffee, data.risk);
    assert.ok(!tags.some((tag) => tag.label === '无代理标记'));
  }
  const data = adaptCoffee({
    ip: '203.0.113.1',
    is_vpn: false,
    is_proxy: false,
    is_tor: false,
  });
  assert.ok(attributeTags(data.coffee, data.risk).some((tag) => tag.label === '无代理标记'));
});
test('conflicting usage fields are not shown as confirmed residential', () => {
  const data = adaptCoffee({
    ip: '203.0.113.1',
    isResidential: true,
    is_datacenter: true,
  });
  const tags = attributeTags(data.coffee, data.risk);
  assert.ok(tags.some((tag) => tag.label === '属性字段存在分歧'));
  assert.ok(!tags.some((tag) => tag.label === '住宅 IP'));
});
test('region tags report location without claiming platform support', () => {
  for (const country of ['CN', 'US', 'RU', 'IR']) {
    assert.match(regionTag('us', country).label, new RegExp(country));
    assert.doesNotMatch(regionTag('us', country).label, /正常|支持/);
  }
});

test('AI attributes list the participating cross sources', () => {
  const data = adaptCoffee({
    ip: '203.0.113.1',
    isResidential: true,
    is_vpn: false,
    is_proxy: false,
    is_tor: false,
  });
  const tags = attributeTags(data.coffee, data.risk, {
    ip: data.coffee.ip,
    readings: [
      {
        id: 'ipinfo-privacy',
        source: 'ipinfo',
        metric: 'privacy',
        value: 'No',
        hint: '',
        tone: 'good',
        href: 'https://ipinfo.io/203.0.113.1',
        flags: { vpn: false, proxy: false, tor: false },
      },
      {
        id: 'proxycheck-usage',
        source: 'proxycheck',
        metric: 'usage',
        value: 'Residential',
        hint: '',
        tone: 'neutral',
        href: 'https://proxycheck.io/v3/203.0.113.1',
      },
    ],
    unavailable: [],
  });
  const source = tags.find((tag) => tag.label.startsWith('属性来源'));
  assert.match(source.label, /Net\.Coffee/);
  assert.match(source.label, /IPinfo/);
  assert.match(source.label, /proxycheck\.io/);
  assert.ok(tags.some((tag) => tag.label === '无代理标记'));
});

test('cross-source positive and negative flags remain a visible disagreement', () => {
  const data = adaptCoffee({ ip: '203.0.113.1', is_vpn: false });
  const tags = attributeTags(data.coffee, data.risk, {
    ip: data.coffee.ip,
    readings: [
      {
        id: 'ipinfo-privacy',
        source: 'ipinfo',
        metric: 'privacy',
        value: 'VPN',
        hint: '',
        tone: 'warn',
        href: 'https://ipinfo.io/203.0.113.1',
        flags: { vpn: true },
      },
    ],
    unavailable: [],
  });
  assert.ok(tags.some((tag) => tag.label === '属性字段存在分歧'));
  assert.ok(tags.some((tag) => tag.label === 'VPN'));
  assert.ok(!tags.some((tag) => tag.label === '无代理标记'));
});

test('crawler evidence cannot be presented as a clean proxy result', () => {
  const data = adaptCoffee({
    ip: '203.0.113.1',
    is_vpn: false,
    is_proxy: false,
    is_tor: false,
    is_crawler: true,
  });
  const tags = attributeTags(data.coffee, data.risk);
  assert.ok(tags.some((tag) => tag.label === '爬虫标记'));
  assert.ok(!tags.some((tag) => tag.label === '无代理标记'));
});
