import { parseDiagnosticReport } from '@/lib/diagnostic-import';
import { normalizeIp, normalizePublicIp } from '@/lib/diagnostics';

export const TERMINAL_EGRESS_COMMAND = 'curl -4 -fsS https://api4.ipify.org';

export function terminalEgressCommand(ip: string) {
  return ip.includes(':') ? 'curl -6 -fsS https://api6.ipify.org' : TERMINAL_EGRESS_COMMAND;
}

export type TerminalEgressSource = 'ipinfo' | 'report' | 'json' | 'text';

export interface TerminalEgressReading {
  ip: string;
  source: TerminalEgressSource;
  distinctIps: number;
  capturedAt: string;
}

export class TerminalPasteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TerminalPasteError';
  }
}

export function sameIp(left?: string, right?: string) {
  const first = normalizeIp(left ?? '');
  const second = normalizeIp(right ?? '');
  return !!first && !!second && first.ip === second.ip;
}

function uniquePublicIps(values: unknown[]) {
  const seen = new Set<string>();
  const ips: string[] = [];
  for (const value of values) {
    const ip = normalizePublicIp(value)?.ip;
    if (!ip || seen.has(ip)) continue;
    seen.add(ip);
    ips.push(ip);
  }
  return ips;
}

function pickMajority(ips: string[]) {
  const counts = new Map<string, number>();
  for (const ip of ips) counts.set(ip, (counts.get(ip) ?? 0) + 1);
  let best = ips[0];
  let bestCount = 0;
  for (const [ip, count] of counts) {
    if (count > bestCount) {
      best = ip;
      bestCount = count;
    }
  }
  return { ip: best, distinctIps: counts.size };
}

function fromJsonObject(value: Record<string, unknown>, now: Date): TerminalEgressReading | null {
  const candidates = [value.ip, value.query, value.address, value.origin];
  const ip = uniquePublicIps(candidates)[0];
  if (!ip) return null;
  const source: TerminalEgressSource =
    typeof value.hostname === 'string' || typeof value.org === 'string' ? 'ipinfo' : 'json';
  return {
    ip,
    source,
    distinctIps: 1,
    capturedAt: now.toISOString(),
  };
}

function fromReport(text: string, now: Date): TerminalEgressReading | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const envelope = parsed as Record<string, unknown>;
  if (envelope.schemaVersion === 1 && Array.isArray(envelope.results)) {
    try {
      const report = parseDiagnosticReport(text, now);
      const ips = report.results
        .filter((item) => item.subject === 'caller-egress' && item.status === 'ok')
        .flatMap((item) => {
          const ip = normalizePublicIp(item.ip)?.ip;
          return ip ? [ip] : [];
        });
      if (!ips.length) throw new TerminalPasteError('贴上的内容里没有公网 IP');
      const picked = pickMajority(ips);
      return {
        ip: picked.ip,
        source: 'report',
        distinctIps: picked.distinctIps,
        capturedAt: now.toISOString(),
      };
    } catch (error) {
      if (error instanceof TerminalPasteError) throw error;
      throw new TerminalPasteError('无法识别这段输出');
    }
  }
  return fromJsonObject(envelope, now);
}

function fromText(text: string): string[] {
  const whole = normalizePublicIp(text)?.ip;
  if (whole) return [whole];
  return uniquePublicIps(
    [...text.matchAll(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g)].map((match) => match[0])
  );
}

export function parseTerminalPaste(input: string, now = new Date()): TerminalEgressReading {
  const text = input.replace(/^\uFEFF/, '').trim();
  if (!text) throw new TerminalPasteError('贴上的内容里没有公网 IP');

  const report = fromReport(text, now);
  if (report) return report;

  const ips = fromText(text);
  if (!ips.length) {
    if (normalizeIp(text) && !normalizePublicIp(text))
      throw new TerminalPasteError('贴上的不是公网出口 IP');
    throw new TerminalPasteError('贴上的内容里没有公网 IP');
  }
  const picked = pickMajority(ips);
  return {
    ip: picked.ip,
    source: 'text',
    distinctIps: picked.distinctIps,
    capturedAt: now.toISOString(),
  };
}
