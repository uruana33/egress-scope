import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildHomeShareSummary, reportMarkdown, reportShareText } from '../src/lib/share-report.ts';

test('home summary and markdown stay within the public snapshot shape', () => {
  assert.equal(buildHomeShareSummary({ verdict: 'pending', domesticIp: '1.1.1.1' }), null);
  const summary = buildHomeShareSummary({
    verdict: 'different',
    domesticIp: '1.1.1.1',
    overseasIp: '8.8.8.8',
    qualityScore: 52.2,
    asn: '13335',
    isp: 'Example',
    flags: { datacenter: true },
  });
  assert.equal(summary.egress_consistent, false);
  assert.equal(summary.quality_score, 52);
  assert.equal(summary.quality_status, 'moderate');
  assert.equal(summary.asn, 13335);
  assert.equal(summary.webrtc_match_http, null);
  const markdown = reportMarkdown({
    url: 'https://tools.example.com/r/r_0123456789ABCDEF',
    summary,
  });
  assert.match(markdown, /## 出口观测台报告/);
  assert.match(markdown, /国内／海外出口：不一致/);
  assert.match(markdown, /WebRTC vs HTTP：未检测/);
  assert.match(markdown, /质量分：52（moderate）/);
  assert.match(markdown, /https:\/\/tools\.example\.com\/r\/r_0123456789ABCDEF/);
});

test('share text is a chat note plus the report link', () => {
  const url = 'https://tools.example.com/r/r_0123456789ABCDEF';
  const text = reportShareText({
    url,
    summary: {
      domestic_ip: '1.1.1.1',
      overseas_ip: '8.8.8.8',
      egress_consistent: false,
      webrtc_match_http: null,
      dns_match_http: true,
      quality_score: 52,
      quality_status: 'moderate',
      asn: 13335,
      isp: 'Example',
    },
  });
  assert.match(text, /国内和海外这次不是同一个出口/);
  assert.match(text, /质量分 52（moderate）/);
  assert.match(text, /WebRTC 这次没测/);
  assert.match(text, /DNS 和网页出口一致/);
  assert.match(text, /出口／IP 质量检测报告链接/);
  assert.match(text, /不是平台过审证明/);
  assert.match(text, new RegExp(url.replaceAll('.', '\\.')));
  assert.match(text, /Egress \/ IP quality check, not a platform verdict:/);
  assert.equal(text.split(url).length, 3);
});
