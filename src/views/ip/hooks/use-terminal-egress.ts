import { useCallback, useState } from 'react';

import {
  type TerminalEgressReading,
  TerminalPasteError,
  parseTerminalPaste,
} from '../model/terminal-egress';

const STORAGE_KEY = 'egress-scope:terminal-egress:v1';

function readStored(): TerminalEgressReading | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TerminalEgressReading>;
    if (typeof parsed.ip !== 'string' || !parsed.ip) return null;
    return {
      ip: parsed.ip,
      source:
        parsed.source === 'ipinfo' ||
        parsed.source === 'report' ||
        parsed.source === 'json' ||
        parsed.source === 'text'
          ? parsed.source
          : 'text',
      distinctIps:
        typeof parsed.distinctIps === 'number' && parsed.distinctIps > 0 ? parsed.distinctIps : 1,
      capturedAt:
        typeof parsed.capturedAt === 'string' ? parsed.capturedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function writeStored(value: TerminalEgressReading | null) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    if (!value) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* Storage may be blocked. */
  }
}

export function useTerminalEgress() {
  const [reading, setReading] = useState<TerminalEgressReading | null>(readStored);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback((input: string) => {
    try {
      const next = parseTerminalPaste(input);
      setReading(next);
      writeStored(next);
      setError(null);
      return next;
    } catch (caught) {
      const message =
        caught instanceof TerminalPasteError ? caught.message : '贴上的内容里没有公网 IP';
      setError(message);
      return null;
    }
  }, []);

  const clear = useCallback(() => {
    setReading(null);
    writeStored(null);
    setError(null);
  }, []);

  return { reading, error, submit, clear };
}
