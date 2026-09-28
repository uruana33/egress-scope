import en from './en.json' with { type: 'json' };

export type Locale = 'zh-CN' | 'en';

const STORAGE_KEY = 'egress-scope:locale';
const DEFAULT_LOCALE: Locale = 'zh-CN';
const messages: Record<string, string> = en;

export function resolveLocale(saved: string | null, languages: readonly string[]): Locale {
  if (saved === 'zh-CN' || saved === 'en') return saved;
  return languages[0]?.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}

function initialLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  // The URL also keeps language switching usable when storage is blocked.
  const override = new URL(window.location.href).searchParams.get('lang');
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    /* Storage may be disabled. */
  }
  const candidate = override === 'en' || override === 'zh-CN' ? override : saved;
  return resolveLocale(candidate, navigator.languages);
}

export const locale = initialLocale();

export function t(message: string, values: readonly unknown[] = []): string {
  const upstreamError = message.match(/^外部数据源暂不可用 \((\d{3})\)$/);
  if (upstreamError) return t('外部数据源暂不可用 ({0})', [upstreamError[1]]);
  const text = locale === 'en' ? (messages[message] ?? message) : message;
  return text.replace(/\{(\d+)\}/g, (slot, index: string) =>
    Number(index) < values.length ? String(values[Number(index)]) : slot
  );
}

export function setLocale(next: Locale) {
  if (next === locale) return;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* URL fallback below. */
  }
  const url = new URL(window.location.href);
  url.searchParams.set('lang', next);
  window.location.assign(url.href);
}

export function initializeLocale() {
  document.documentElement.lang = locale;
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path !== '/') return;
  document.title = t('出口IP检测 / WebRTC / DNS / IP质量 · 出口观测台');
  const description = document.querySelector('meta[name="description"]');
  if (description) {
    description.setAttribute(
      'content',
      t('对照国内与海外出口是否按规则走，检查 WebRTC／DNS 泄露，查看 IP 质量分与机房／代理标记。')
    );
  }
}
