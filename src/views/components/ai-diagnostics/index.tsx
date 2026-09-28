import { useEffect } from 'react';

import { useQuery } from '@tanstack/react-query';
import { useAtom } from 'jotai';

import { PageHeading } from '@/components/toolkit';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { t } from '@/i18n';
import { queryKeys } from '@/lib/query-keys';
import { AiNetworkCheck } from '@/views/ai/network-check';
import { AiPlatformLinks } from '@/views/ai/platform-links';
import { aiPlatforms } from '@/views/ai/platforms';
import { AI_DETAIL_SAMPLE_COUNT } from '@/views/ai/probe';
import { claudeApi } from '@/views/claude/api';
import { claudeHistoryAtom } from '@/views/claude/store';
import { gptApi } from '@/views/gpt/api';
import { gptHistoryAtom } from '@/views/gpt/store';

import { ExitCard, ExitHistory } from './exit-card';

const KINDS: Record<
  'claude' | 'gpt',
  {
    api: typeof claudeApi;
    atom: typeof claudeHistoryAtom;
    label: string;
    title: () => string;
    domains: string[];
  }
> = {
  claude: {
    api: claudeApi,
    atom: claudeHistoryAtom,
    label: 'Claude AI',
    title: () => t('Claude AI 网络检测'),
    domains: ['claude.ai', 'api.anthropic.com'],
  },
  gpt: {
    api: gptApi,
    atom: gptHistoryAtom,
    label: 'ChatGPT',
    title: () => t('ChatGPT · Codex 网络检测'),
    domains: ['chatgpt.com', 'api.openai.com'],
  },
};

const HISTORY_LIMIT = 20;

export default function AiDiagnostics({ kind }: { kind: 'claude' | 'gpt' }) {
  const config = KINDS[kind];
  const [history, setHistory] = useAtom(config.atom);

  const domestic = useQuery({
    queryKey: queryKeys.egress.domestic(),
    queryFn: ({ signal }) => config.api.domestic(signal),
    retry: false,
  });
  const cf = useQuery({
    queryKey: queryKeys.egress.cloudflare(),
    queryFn: ({ signal }) => config.api.cloudflare(signal),
    retry: false,
  });
  const exit = useQuery({
    queryKey: queryKeys.ai.exit(kind),
    staleTime: 60_000,
    queryFn: ({ signal }) => config.api.exit(signal),
    retry: false,
  });
  const ip = exit.data?.ip;
  const geo = useQuery({
    queryKey: queryKeys.geo.byIp(ip),
    enabled: !!ip,
    queryFn: ({ signal }) => config.api.geo(ip!, signal),
    retry: false,
  });

  useEffect(() => {
    if (ip)
      setHistory((previous) =>
        previous[0]?.ip === ip
          ? previous
          : [{ ip, time: new Date().toISOString() }, ...previous].slice(0, HISTORY_LIMIT)
      );
  }, [ip, setHistory]);

  return (
    <div className="ai-diagnostics">
      <PageHeading title={config.title()} description="" />
      <div className="ai-overview">
        <ExitCard
          label={config.label}
          exit={exit}
          geo={geo}
          comparisons={[
            { query: domestic, title: t('国内 IPv4') },
            { query: cf, title: 'Cloudflare' },
          ]}
        />
        <AiNetworkCheck domains={config.domains} sampleCount={AI_DETAIL_SAMPLE_COUNT}>
          <p className="small muted mt-3">{t('浏览器 HTTP 探测，不代表账号可用或模型权限。')}</p>
          <AiPlatformLinks platform={aiPlatforms.find((platform) => platform.id === kind)!} />
        </AiNetworkCheck>
      </div>
      <Accordion type="multiple" className="ai-details">
        <AccordionItem value="history">
          <AccordionTrigger>
            <span>
              {t('出口历史')}{' '}
              <span className="ai-detail-summary">
                {history.length}
                {t('条 · 当前浏览器')}
              </span>
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <ExitHistory history={history} onClear={() => setHistory([])} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
