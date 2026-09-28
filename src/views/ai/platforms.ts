import { t } from '@/i18n';

export type AiCamp = 'us' | 'cn';

export interface AiPlatformDef {
  id: string;
  camp: AiCamp;
  name: string;
  domain: string;
  /** Cloudflare zone that serves a CORS-readable /cdn-cgi/trace (实测出口). */
  traceDomain?: string;
  apiUrl?: string;
  docsUrl?: string;
  docsLabel?: string;
  statusId?: string;
  statusPage?: string;
  statusLabel?: string;
}

export const aiPlatforms: AiPlatformDef[] = [
  {
    id: 'gpt',
    camp: 'us' as AiCamp,
    traceDomain: 'chatgpt.com',
    apiUrl: 'https://api.openai.com/v1',
    docsUrl: 'https://platform.openai.com/docs/overview',
    name: 'ChatGPT',
    domain: 'chatgpt.com',
    statusId: '9',
  },
  {
    id: 'claude',
    camp: 'us' as AiCamp,
    traceDomain: 'claude.ai',
    apiUrl: 'https://api.anthropic.com',
    docsUrl: 'https://platform.claude.com/docs/en/api/overview',
    name: 'Claude',
    domain: 'claude.ai',
    statusId: '4',
  },
  {
    id: 'grok',
    camp: 'us' as AiCamp,
    traceDomain: 'grok.com',
    apiUrl: 'https://api.x.ai',
    docsUrl: 'https://docs.x.ai/',
    statusId: '33',
    name: 'Grok',
    domain: 'grok.com',
    statusPage: 'https://status.x.ai',
  },
  {
    id: 'perplexity',
    camp: 'us' as AiCamp,
    traceDomain: 'www.perplexity.ai',
    apiUrl: 'https://api.perplexity.ai',
    docsUrl: 'https://docs.perplexity.ai/',
    name: 'Perplexity',
    domain: 'www.perplexity.ai',
    statusId: '10',
  },
  {
    id: 'gemini',
    camp: 'us' as AiCamp,
    apiUrl: 'https://generativelanguage.googleapis.com',
    docsUrl: 'https://ai.google.dev/gemini-api/docs',
    statusId: '31',
    name: 'Gemini',
    domain: 'gemini.google.com',
    statusPage: 'https://aistudio.google.com/status',
    statusLabel: t('AI Studio / Gemini API 状态'),
  },
  {
    id: 'copilot',
    camp: 'us' as AiCamp,
    traceDomain: 'copilot.microsoft.com',
    docsUrl: 'https://support.microsoft.com/copilot',
    docsLabel: t('使用文档'),
    statusId: 'copilot',
    name: 'Copilot',
    domain: 'copilot.microsoft.com',
  },
  {
    id: 'deepseek',
    camp: 'cn' as AiCamp,
    apiUrl: 'https://api.deepseek.com',
    docsUrl: 'https://api-docs.deepseek.com/',
    statusId: '32',
    name: 'DeepSeek',
    domain: 'chat.deepseek.com',
    statusPage: 'https://status.deepseek.com',
  },
  {
    id: 'qwen',
    camp: 'cn' as AiCamp,
    apiUrl: 'https://dashscope-us.aliyuncs.com/compatible-mode/v1',
    docsUrl:
      'https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope',
    statusId: '34',
    name: t('通义千问'),
    domain: 'chat.qwen.ai',
  },
  {
    id: 'kimi',
    camp: 'cn' as AiCamp,
    apiUrl: 'https://api.moonshot.cn/v1',
    docsUrl: 'https://platform.moonshot.cn/docs/intro',
    statusId: '35',
    name: 'Kimi',
    domain: 'www.kimi.com',
  },
  {
    id: 'glm',
    camp: 'cn' as AiCamp,
    apiUrl: 'https://open.bigmodel.cn/api/paas/v4',
    docsUrl: 'https://docs.bigmodel.cn/',
    statusId: 'zhipu',
    name: t('智谱 GLM'),
    domain: 'chatglm.cn',
  },
  {
    id: 'doubao',
    camp: 'cn' as AiCamp,
    apiUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    docsUrl: 'https://www.volcengine.com/docs/82379',
    statusId: 'doubao',
    name: t('豆包'),
    domain: 'www.doubao.com',
  },
];
export type AiPlatform = AiPlatformDef;
