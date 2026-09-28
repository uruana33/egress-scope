import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export const themeTransitionPendingAtom = atom(false);

export const SITE_THEMES = [
  {
    id: 'paper',
    label: '纸白',
    scheme: 'light',
    themeColor: '#2563eb',
    swatches: ['#f4f7fb', '#2563eb'],
  },
  {
    id: 'ink',
    label: '墨夜',
    scheme: 'dark',
    themeColor: '#0b1220',
    swatches: ['#070b12', '#67e8f9'],
  },
  {
    id: 'parchment',
    label: '羊皮',
    scheme: 'light',
    themeColor: '#b45309',
    swatches: ['#f4efe4', '#b45309'],
  },
  {
    id: 'chart',
    label: '海图',
    scheme: 'light',
    themeColor: '#0f766e',
    swatches: ['#eef6f3', '#0f766e'],
  },
  {
    id: 'ember',
    label: '余烬',
    scheme: 'dark',
    themeColor: '#1c1410',
    swatches: ['#16110c', '#e8a54b'],
  },
] as const;

export type Theme = (typeof SITE_THEMES)[number]['id'];
export type ColorScheme = (typeof SITE_THEMES)[number]['scheme'];

const themeIds = new Set<string>(SITE_THEMES.map((item) => item.id));

export const themeById = Object.fromEntries(SITE_THEMES.map((item) => [item.id, item])) as Record<
  Theme,
  (typeof SITE_THEMES)[number]
>;

export function isTheme(value: string | null | undefined): value is Theme {
  return !!value && themeIds.has(value);
}

export function migrateTheme(value: string | null | undefined, prefersDark: boolean): Theme {
  if (value === 'light') return 'paper';
  if (value === 'dark') return 'ink';
  if (isTheme(value)) return value;
  return prefersDark ? 'ink' : 'paper';
}

export function applyDocumentTheme(theme: Theme) {
  const root = document.documentElement;
  const spec = themeById[theme];
  root.dataset.theme = theme;
  root.classList.toggle('dark', spec.scheme === 'dark');
  root.style.colorScheme = spec.scheme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', spec.themeColor);
}

function prefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export const themeAtom = atomWithStorage<Theme>(
  'theme',
  'paper',
  {
    getItem(key, initialValue) {
      try {
        return migrateTheme(localStorage.getItem(key), prefersDark());
      } catch {
        return initialValue;
      }
    },
    setItem(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch {
        /* Storage may be disabled. */
      }
    },
    removeItem(key) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* Storage may be disabled. */
      }
    },
  },
  { getOnInit: true }
);
