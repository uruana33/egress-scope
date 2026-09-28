import { useAtom } from 'jotai';

import { type Theme, applyDocumentTheme, themeAtom, themeById } from '@/store/theme';

export function useTheme() {
  const [theme, updateTheme] = useAtom(themeAtom);
  const scheme = themeById[theme].scheme;
  const setTheme = (next: Theme) => {
    applyDocumentTheme(next);
    updateTheme(next);
  };
  return { theme, setTheme, scheme, resolvedTheme: scheme };
}
