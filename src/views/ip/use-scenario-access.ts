import { useCallback, useEffect, useRef, useState } from 'react';

import type { Evidence } from './scenario-evidence';
import { measurePlatforms } from './scenario-probes';
import { accessTargets } from './scenario-targets';

const FLUSH_MS = 80;

type Records = Record<string, Evidence>;

function markRunningAs(records: Records, state: Evidence['state']): Records {
  return Object.fromEntries(
    Object.entries(records).map(([key, value]) => [
      key,
      value.state === 'running' ? { ...value, state } : value,
    ])
  );
}

export function useScenarioAccess(ip: string) {
  const [records, setRecords] = useState<Records>({});
  const [busy, setBusy] = useState(true);
  const controller = useRef<AbortController | null>(null);

  const start = useCallback(() => {
    controller.current?.abort();
    const control = new AbortController();
    controller.current = control;

    // Strict Mode's first mount can be cancelled before any network work starts.
    void Promise.resolve().then(async () => {
      if (control.signal.aborted) return;
      setRecords({});
      setBusy(true);

      let staged: Records = {};
      let timer: ReturnType<typeof setTimeout> | undefined;
      const flush = () => {
        clearTimeout(timer);
        timer = undefined;
        if (control.signal.aborted || !Object.keys(staged).length) return;
        const updates = staged;
        staged = {};
        setRecords((previous) => ({ ...previous, ...updates }));
      };
      const drop = () => {
        clearTimeout(timer);
        staged = {};
      };
      control.signal.addEventListener('abort', drop, { once: true });

      try {
        await measurePlatforms(ip, accessTargets, control.signal, (target, evidence) => {
          if (control.signal.aborted) return;
          staged[target.url] = evidence;
          timer ??= setTimeout(flush, FLUSH_MS);
        });
      } catch {
        flush();
        if (!control.signal.aborted) {
          setRecords((previous) => markRunningAs(previous, 'unverifiable'));
        }
      } finally {
        flush();
        control.signal.removeEventListener('abort', drop);
        if (controller.current === control && !control.signal.aborted) setBusy(false);
      }
    });
  }, [ip]);

  useEffect(() => {
    start();
    const connection = (navigator as Navigator & { connection?: EventTarget }).connection;
    window.addEventListener('online', start);
    connection?.addEventListener('change', start);
    return () => {
      controller.current?.abort();
      window.removeEventListener('online', start);
      connection?.removeEventListener('change', start);
    };
  }, [start]);

  const cancel = () => {
    controller.current?.abort();
    setBusy(false);
    setRecords((previous) => markRunningAs(previous, 'cancelled'));
  };

  return { records, busy, start, cancel };
}
