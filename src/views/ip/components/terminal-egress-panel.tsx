import { type FormEvent, useState } from 'react';

import { Link } from 'react-router-dom';

import { CopyButton } from '@/components/copy-button';
import { Button } from '@/components/ui/button';
import { t } from '@/i18n';
import { maskedIp } from '@/lib/network';
import { lookupHref } from '@/views/lookup/href';

import {
  type TerminalEgressReading,
  sameIp,
  terminalEgressCommand,
} from '../model/terminal-egress';
import { chip } from '../panels/cells';

export function TerminalEgressPanel({
  queriedIp,
  reading,
  error,
  hidden,
  onSubmit,
  onClear,
}: {
  queriedIp: string;
  reading: TerminalEgressReading | null;
  error: string | null;
  hidden: boolean;
  onSubmit: (value: string) => boolean;
  onClear: () => void;
}) {
  const [draft, setDraft] = useState('');
  const match = reading ? sameIp(reading.ip, queriedIp) : false;
  const shown = reading ? maskedIp(reading.ip, hidden) : '';
  const command = terminalEgressCommand(queriedIp);
  const tone = reading ? (match ? 'good' : 'warn') : undefined;

  const apply = (text: string) => {
    if (onSubmit(text)) setDraft('');
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    apply(draft);
  };

  return (
    <section className="ip-folio-terminal" data-tone={tone} aria-label={t('终端出口')}>
      <header className="ip-folio-terminal-head">
        <span className="ip-folio-terminal-name">
          <strong>{t('终端出口')}</strong>
          <span>{t('本机 curl · ipify')}</span>
        </span>
        {reading ? chip(match ? t('同一出口') : t('不同出口'), match ? 'good' : 'warn') : null}
      </header>

      {reading ? (
        <div className="ip-folio-terminal-result">
          <strong className="ip-folio-terminal-ip">{shown}</strong>
          <p>
            {match ? t('本机 curl 看到的地址与查询地址相同') : t('浏览器和终端可能不是同一条路径')}
          </p>
          <div className="ip-folio-terminal-actions">
            {!match ? (
              <Link className="ip-folio-terminal-link" to={lookupHref(reading.ip)}>
                {t('查询该地址')}
              </Link>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => {
                setDraft('');
                onClear();
              }}>
              {t('重贴')}
            </Button>
          </div>
        </div>
      ) : (
        <form className="ip-folio-terminal-steps" onSubmit={submit}>
          <div className="ip-folio-terminal-rail">
            <span className="ip-folio-terminal-index" aria-hidden="true">
              1
            </span>
            <code>{command}</code>
            <CopyButton value={command} />
          </div>
          <label className="ip-folio-terminal-rail" htmlFor="terminal-egress-paste">
            <span className="ip-folio-terminal-index" aria-hidden="true">
              2
            </span>
            <input
              id="terminal-egress-paste"
              name="terminal-egress"
              type="text"
              inputMode="text"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="off"
              placeholder={t('贴回 IP')}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onPaste={(event) => {
                const text = event.clipboardData.getData('text');
                if (!text.trim()) return;
                event.preventDefault();
                setDraft(text);
                apply(text);
              }}
            />
          </label>
          {error ? (
            <p className="ip-folio-terminal-error" role="alert">
              {t(error)}
            </p>
          ) : (
            <p className="ip-folio-terminal-why">{t('与浏览器出口探测同一回显，只对照路径。')}</p>
          )}
        </form>
      )}
    </section>
  );
}
