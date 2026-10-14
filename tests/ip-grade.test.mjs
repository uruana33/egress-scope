import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  classifyHolder,
  gateGeo,
  gatePrivacy,
  gateRdns,
  gateStable,
  judgeGrade,
  parseScamalyticsPage,
  qualityTier,
} from '../public/worker/ip-grade.js';

/**
 * Fixture suite ported case-for-case from ip-quality-report.py --self-test.
 * The Python file is the spec; when the gates change there, these fixtures
 * should change the same way. Reports are synthetic source snapshots, no
 * live upstream calls are made.
 */
function baseReport() {
  return {
    ip: '1.2.3.4',
    rdns: 'c-1-2-3-4.hsd1.il.comcast.net',
    sources: {
      ripe: { ok: true, prefix: '1.2.3.0/24', asns: ['AS7922 COMCAST-7922'] },
      rdap: {
        ok: true,
        name: 'COMCAST-CABLE',
        registrant: 'Comcast Cable Communications, LLC',
        prefix: '1.2.3.0/24',
        length: 24,
        type: 'ASSIGNMENT',
      },
      ipinfo: {
        ok: true,
        hosting: false,
        vpn: false,
        proxy: false,
        tor: false,
        city: 'Chicago',
        region: 'Illinois',
        timezone: 'America/Chicago',
        asn_name: 'COMCAST-7922',
        company: 'Comcast Cable',
        company_type: 'isp',
      },
      ipwho: {
        ok: true,
        org: 'Comcast Cable Communications, LLC',
        isp: 'Comcast',
        city: 'Chicago',
        region: 'Illinois',
        timezone: 'America/Chicago',
      },
      ipquery: {
        ok: true,
        org: 'Comcast',
        isp: 'Comcast',
        city: 'Chicago',
        region: 'Illinois',
        datacenter: false,
        vpn: false,
        proxy: false,
        tor: false,
      },
      proxycheck: {
        ok: true,
        provider: 'Comcast',
        organisation: 'Comcast',
        type: 'ISP',
        proxy: 'no',
        city: 'Chicago',
        region: 'IL',
      },
      scamalytics: {
        ok: true,
        score: 4,
        isp: 'Comcast',
        org: 'Comcast',
        datacenter: 'No',
        vpn: 'No',
        server: 'No',
        residential_proxy: 'No',
        public_proxy: 'No',
      },
    },
  };
}

function mobileReport() {
  const report = baseReport();
  report.rdns = 'mobile-107-77-226-109.mobile.att.net';
  report.sources.ripe = {
    ok: true,
    prefix: '107.77.226.0/24',
    asns: ['AS20057 ATT-MOBILITY-LLC-AS20057'],
  };
  report.sources.rdap = {
    ok: true,
    name: 'ATT-MOBILITY-LLC',
    registrant: 'AT&T Enterprises, LLC',
    prefix: '107.64.0.0/10',
    length: 10,
  };
  report.sources.proxycheck.type = 'Wireless';
  report.sources.ipwho.org = 'AT&T Mobility';
  report.sources.ipwho.isp = 'AT&T Mobility';
  report.sources.ipquery.org = 'AT&T Mobility';
  report.sources.ipquery.isp = 'AT&T Mobility';
  report.sources.proxycheck.provider = 'AT&T Mobility';
  report.sources.proxycheck.organisation = 'AT&T Mobility';
  report.sources.ipinfo.asn_name = 'ATT-MOBILITY-LLC-AS20057';
  report.sources.ipinfo.company = 'AT&T Mobility';
  report.sources.ipwho.city = 'New York City';
  report.sources.ipwho.region = 'New York';
  report.sources.ipquery.city = 'New York';
  report.sources.ipquery.region = 'NY';
  report.sources.proxycheck.city = 'New York';
  report.sources.proxycheck.region = 'New York';
  report.sources.ipinfo.city = 'New York';
  report.sources.ipinfo.region = 'New York';
  report.sources.ipinfo.timezone = 'America/New_York';
  report.sources.ipwho.timezone = 'America/New_York';
  return report;
}

function businessReport() {
  const report = baseReport();
  report.rdns = '无';
  report.sources.rdap = {
    ok: true,
    name: 'UUNETCBLK252',
    registrant: 'Verizon Business',
    prefix: '204.252.0.0/14',
    length: 14,
  };
  report.sources.ripe = {
    ok: true,
    prefix: '204.252.0.0/14',
    asns: ['AS701 VERIZON-BUSINESS'],
  };
  return report;
}

function transitReport() {
  const report = baseReport();
  report.rdns = '无';
  report.sources.rdap = {
    ok: true,
    name: 'GTT',
    registrant: 'GTT Communications Inc.',
    prefix: '70.39.176.0/21',
    length: 21,
  };
  report.sources.ripe = { ok: true, prefix: '70.39.176.0/21', asns: ['AS3257 GTT'] };
  return report;
}

function resoldReport() {
  const report = baseReport();
  report.rdns = '无';
  report.sources.rdap = {
    ok: true,
    name: 'WOOKRA-US',
    registrant: 'lir-us-wookra-1-MNT',
    prefix: '31.105.160.0/19',
    length: 19,
  };
  report.sources.ripe = { ok: true, prefix: '31.105.160.0/19', asns: ['AS6079 RCN'] };
  report.sources.ipwho.org = 'Wookra LLC';
  report.sources.ipwho.isp = 'Wookra';
  report.sources.ipquery.org = 'Wookra';
  report.sources.ipquery.isp = 'Wookra';
  report.sources.ipinfo.asn_name = 'AS6079';
  report.sources.ipinfo.company = 'Wookra';
  report.sources.ipinfo.asn_type = 'isp';
  report.sources.ipinfo.company_type = 'isp';
  report.sources.proxycheck.provider = 'RCN';
  report.sources.proxycheck.organisation = 'RCN';
  report.sources.scamalytics.isp = 'Wookra';
  report.sources.scamalytics.org = 'Wookra';
  report.sources.proxycheck.type = 'Business';
  return report;
}

function resoldCleanReport() {
  const report = resoldReport();
  report.sources.ipwho.org = 'Comcast Cable Communications, LLC';
  report.sources.ipwho.isp = 'Comcast';
  report.sources.ipquery.org = 'Comcast';
  report.sources.ipquery.isp = 'Comcast';
  report.sources.ipinfo.asn_name = 'COMCAST-7922';
  report.sources.ipinfo.company = 'Comcast Cable';
  report.sources.ipinfo.asn_type = undefined;
  report.sources.ipinfo.company_type = 'isp';
  report.sources.proxycheck.provider = 'Comcast';
  report.sources.proxycheck.organisation = 'Comcast';
  report.sources.scamalytics.isp = 'Comcast';
  report.sources.scamalytics.org = 'Comcast';
  report.sources.proxycheck.type = 'ISP';
  return report;
}

test('clean Comcast report passes gates 1-4, gate 5 waits for a human', () => {
  const clean = judgeGrade(baseReport());
  assert.equal(clean.gates[0].status, '通过');
  assert.equal(clean.gates[1].status, '通过');
  assert.equal(clean.gates[2].status, '通过');
  assert.equal(clean.gates[3].status, '通过');
  assert.equal(clean.gates[4].status, '待核对');
  assert.ok(clean.verdict.startsWith('公开库能查的都过了'));
  assert.ok(clean.gates.every((gate) => gate.expected));
});

test('mobile AT&T fails gates 1, 3, 5 and keeps a passing geo majority', () => {
  const judged = judgeGrade(mobileReport());
  assert.equal(judged.gates[0].status, '不过');
  assert.ok(judged.gates[0].detail.includes('蜂窝'));
  assert.equal(judged.gates[2].status, '不过');
  assert.equal(judged.gates[3].status, '通过');
  assert.equal(judged.gates[4].status, '不过');
  assert.ok(judged.verdict.startsWith('不要拿来开新号'));
});

test('Verizon Business umbrella block fails gate 1, empty rDNS still passes 3', () => {
  const judged = judgeGrade(businessReport());
  assert.equal(judged.gates[0].status, '不过');
  assert.equal(judged.gates[2].status, '通过');
});

test('GTT transit registration fails gate 1', () => {
  assert.equal(judgeGrade(transitReport()).gates[0].status, '不过');
});

test('Unknown datacenter fields do not veto gate 2', () => {
  const report = baseReport();
  report.sources.scamalytics.datacenter = 'Unknown';
  report.sources.ipinfo.ok = false;
  const judged = judgeGrade(report);
  assert.equal(judged.gates[1].status, '通过');
  assert.ok(judged.verdict.startsWith('公开库能查的都过了'));
});

test('a single datacenter yes fails gate 2', () => {
  const report = baseReport();
  report.sources.ipquery.datacenter = true;
  assert.equal(judgeGrade(report).gates[1].status, '不过');
});

test('two-way state split fails gate 4; a single outlier does not', () => {
  const split = baseReport();
  split.sources.ipwho.city = 'Los Angeles';
  split.sources.ipwho.region = 'California';
  split.sources.ipquery.city = 'Cambridge';
  split.sources.ipquery.region = 'Massachusetts';
  split.sources.proxycheck.city = 'Los Angeles';
  split.sources.proxycheck.region = 'California';
  split.sources.ipinfo.city = 'Cambridge';
  split.sources.ipinfo.region = 'Massachusetts';
  assert.equal(judgeGrade(split).gates[3].status, '不过');

  const outlier = baseReport();
  outlier.sources.ipquery.city = 'Hatfield';
  outlier.sources.ipquery.region = 'England';
  assert.equal(judgeGrade(outlier).gates[3].status, '通过');
});

test('same-state suburbs across sources pass gate 4', () => {
  const report = baseReport();
  report.sources.ipquery.city = 'Mesa';
  report.sources.ipquery.region = 'Arizona';
  report.sources.ipwho.city = 'Phoenix';
  report.sources.ipwho.region = 'AZ';
  report.sources.proxycheck.city = 'Phoenix';
  report.sources.proxycheck.region = 'Arizona';
  report.sources.ipinfo.city = 'Phoenix';
  report.sources.ipinfo.region = 'Arizona';
  report.sources.ipinfo.timezone = 'America/Phoenix';
  report.sources.ipwho.timezone = 'America/Phoenix';
  assert.equal(judgeGrade(report).gates[3].status, '通过');
});

test('missing RDAP leaves gate 1 undecided', () => {
  const report = baseReport();
  report.sources.rdap = { ok: false, error: 'HTTP 404' };
  assert.equal(judgeGrade(report).gates[0].status, '无法判断');
});

test('a hosting word in another source org field fails gate 1', () => {
  const report = baseReport();
  report.sources.ipinfo.company = 'Ace Data Centers';
  assert.equal(judgeGrade(report).gates[0].status, '不过');
});

test('Wookra resale with RCN announcement and Business label fails gate 1', () => {
  assert.equal(judgeGrade(resoldReport()).gates[0].status, '不过');
});

test('handle-only registrant cannot borrow the announced ASN', () => {
  const judged = judgeGrade(resoldCleanReport());
  assert.equal(judged.gates[0].status, '不过');
  assert.ok(judged.gates[0].detail.includes('母 ASN'));
});

test('a transit ASN announcement vetoes even a named fixed-line registration', () => {
  const report = baseReport();
  report.sources.ripe = { ok: true, prefix: '1.2.3.0/24', asns: ['AS174 COGENT-174'] };
  assert.equal(judgeGrade(report).gates[0].status, '不过');
});

test('named ISP plus Business label is a conflict, not a pass or fail', () => {
  const report = baseReport();
  report.sources.proxycheck.type = 'Business';
  const judged = judgeGrade(report);
  assert.equal(judged.gates[0].status, '无法判断');
  assert.ok(judged.verdict.startsWith('还不能当成通过'));
});

test('unnamed registrant plus Business label fails gate 1', () => {
  const report = baseReport();
  report.sources.rdap = {
    ok: true,
    name: 'NET3-CBLK',
    registrant: 'NET3 Inc',
    prefix: '12.12.122.0/24',
    length: 24,
  };
  report.sources.proxycheck.type = 'Business';
  assert.equal(judgeGrade(report).gates[0].status, '不过');
});

test('a listed fixed-line name outside the original seven still passes', () => {
  const report = baseReport();
  report.sources.rdap = {
    ok: true,
    name: 'SUDDENLINK',
    registrant: 'Suddenlink Communications',
    prefix: '47.2.0.0/16',
    length: 16,
  };
  assert.equal(judgeGrade(report).gates[0].status, '通过');
});

test('small residential ISP passes gate 1 via fallback isp signals', () => {
  const report = baseReport();
  report.sources.rdap = {
    ok: true,
    name: 'JETBROADBAND',
    registrant: 'Jet Broadband, LLC',
    prefix: '64.127.0.0/18',
    length: 18,
  };
  report.sources.ipinfo.asn_type = 'isp';
  report.sources.proxycheck.type = 'Residential';
  assert.equal(judgeGrade(report).gates[0].status, '通过');
});

test('Metronet registration with a CenturyLink announcement fails on the ASN', () => {
  const report = baseReport();
  report.rdns = '无';
  report.sources.rdap = {
    ok: true,
    name: 'METRONET',
    registrant: 'Metronet',
    prefix: '108.165.18.0/24',
    length: 24,
  };
  report.sources.ripe = {
    ok: true,
    prefix: '108.165.18.0/24',
    asns: ['AS16591 CENTURYLINK-SAVVIS'],
  };
  const judged = judgeGrade(report);
  assert.equal(judged.gates[0].status, '不过');
  assert.ok(judged.gates[0].detail.includes('公告 ASN'));
});

test('expect_state turns gate 4 into a failure when the majority disagrees', () => {
  const report = baseReport();
  report.expect = { state: 'CA', tz: undefined };
  assert.equal(judgeGrade(report).gates[3].status, '不过');
});

test('stable_confirmed marks gate 5 passed by human attestation', () => {
  const report = baseReport();
  report.stable_confirmed = true;
  const judged = judgeGrade(report);
  assert.equal(judged.gates[4].status, '通过');
  assert.ok(judged.verdict.startsWith('五条都通过'));
});

test('tier grading: T0 clean, T3 transit, T1 conflict, T2 resale, T3 mobile', () => {
  assert.ok(judgeGrade(baseReport()).tier.startsWith('T0'));
  assert.ok(judgeGrade(transitReport()).tier.startsWith('T3'));
  const conflict = baseReport();
  conflict.sources.proxycheck.type = 'Business';
  assert.ok(judgeGrade(conflict).tier.startsWith('T1'));
  assert.ok(judgeGrade(resoldReport()).tier.startsWith('T2'));
  assert.ok(judgeGrade(mobileReport()).tier.startsWith('T3'));
});

test('Quantum Fiber exempts the Lumen family words', () => {
  const report = baseReport();
  report.sources.rdap = {
    ok: true,
    name: 'QUANTUMFIBER-CUST',
    registrant: 'Quantum Fiber, a Lumen company',
    prefix: '69.70.0.0/16',
    length: 16,
  };
  report.sources.ripe = {
    ok: true,
    prefix: '69.70.0.0/16',
    asns: ['AS209 CENTURYLINK-QWEST'],
  };
  assert.equal(judgeGrade(report).gates[0].status, '通过');
});

test('CenturyLink umbrella registration still fails', () => {
  const report = baseReport();
  report.sources.rdap = {
    ok: true,
    name: 'CENTURYLINK-LEGACY-QWEST-US-IN',
    registrant: 'CenturyLink Communications',
    prefix: '69.70.0.0/16',
    length: 16,
  };
  assert.equal(judgeGrade(report).gates[0].status, '不过');
});

test('Hurricane Electric registration fails as transit', () => {
  const report = baseReport();
  report.sources.rdap = {
    ok: true,
    name: 'HURRICANE-IPV6',
    registrant: 'Hurricane Electric LLC',
    prefix: '64.71.128.0/18',
    length: 18,
  };
  assert.equal(judgeGrade(report).gates[0].status, '不过');
});

test('thin sources leave gate 2 undecided', () => {
  const report = baseReport();
  report.sources.ipinfo = { ok: false, error: 'HTTP 429' };
  report.sources.scamalytics = { ok: false, error: 'HTTP 403' };
  report.sources.proxycheck = { ok: false, error: 'HTTP 500' };
  assert.equal(judgeGrade(report).gates[1].status, '无法判断');
});

test('a source whose org does not match the registration is marked suspect', () => {
  const report = baseReport();
  report.sources.ipquery.org = 'Totally Unrelated Ltd';
  report.sources.ipquery.isp = 'Unrelated Net';
  report.sources.ipquery.city = 'London';
  report.sources.ipquery.region = 'England';
  const judged = judgeGrade(report);
  assert.equal(judged.gates[3].status, '通过');
  assert.ok(judged.gates[3].detail.includes('存疑'));
});

test('NTT transit allocation with a poisoned fingerprint grades T3-', () => {
  const report = baseReport();
  report.rdns = '无';
  report.sources.rdap = {
    ok: true,
    name: 'NTTA-192-220',
    registrant: 'NTT America, Inc.',
    prefix: '192.220.0.0/16',
    length: 16,
    type: 'DIRECT ALLOCATION',
  };
  report.sources.ripe = {
    ok: true,
    prefix: '192.220.0.0/16',
    asns: ['AS2914 NTT-DATA-2914 - NTT America, Inc.'],
  };
  report.sources.ipwho.org = 'NTT America, Inc.';
  report.sources.ipwho.isp = 'NTT America, Inc.';
  report.sources.ipquery.org = 'NTT America, Inc.';
  report.sources.ipquery.isp = 'NTT America, Inc.';
  report.sources.ipinfo.asn_name = 'NTT-DATA-2914';
  report.sources.ipinfo.company = 'NTT Communications';
  report.sources.proxycheck.provider = 'NTT America, Inc.';
  report.sources.proxycheck.organisation = 'NTT Communications';
  report.sources.proxycheck.type = 'Business';
  report.sources.scamalytics.isp = 'NTT America, Inc.';
  report.sources.scamalytics.org = 'NTT Communications';
  report.sources.scamalytics.server = 'Yes';
  const judged = judgeGrade(report);
  assert.equal(judged.gates[0].status, '不过');
  assert.equal(judged.gates[1].status, '不过');
  assert.ok(judged.tier.startsWith('T3-'));
  assert.ok(judged.verdict.startsWith('不要拿来开新号'));
});

test('parseScamalyticsPage extracts the gate fields from a lookup page', () => {
  const html = `<html><body>
    <p>IP address 192.0.2.1 Fraud Risk</p><span>Fraud Score: 6</span>
    <div>Datacenter</div><div>Unknown</div>
    <div>Anonymizing VPN</div><div>No</div>
    <div>Tor Exit Node</div><div>No</div>
    <div>Server</div><div>Yes</div>
    <div>Public Proxy</div><div>No</div>
    <div>Web Proxy</div><div>No</div>
    <div>Residential Proxy</div><div>No</div>
    <div>Search Engine Robot</div><div>No</div>
    <p>some unrelated text keeping the operator table out of answer range</p>
    <p>and another line of filler for good measure</p>
    <table><tr><td>Hostname</td><td>n/a</td></tr>
    <tr><td>ISP Name</td><td>NTT America, Inc.</td></tr>
    <tr><td>Organization Name</td><td>NTT Communications</td></tr></table>
  </body></html>`;
  const parsed = parseScamalyticsPage(html);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.score, 6);
  assert.equal(parsed.isp, 'NTT America, Inc.');
  assert.equal(parsed.org, 'NTT Communications');
  assert.equal(parsed.datacenter, 'Unknown');
  assert.equal(parsed.vpn, 'No');
  assert.equal(parsed.server, 'Yes');
  assert.equal(parsed.public_proxy, 'No');
  assert.equal(parsed.residential_proxy, 'No');
});

test('gate functions are exported and callable on their own', () => {
  const report = baseReport();
  const holder = classifyHolder(report);
  assert.equal(holder.status, '通过');
  assert.equal(gatePrivacy(report).status, '通过');
  assert.equal(gateRdns(report, holder).status, '通过');
  assert.equal(gateGeo(report).status, '通过');
  assert.equal(gateStable(report, holder).status, '待核对');
  const gates = [
    { status: holder.status },
    gatePrivacy(report),
    gateRdns(report, holder),
    gateGeo(report),
    gateStable(report, holder),
  ];
  assert.ok(qualityTier(report, holder, gates)[0].startsWith('T0'));
});
