import { type PropsWithChildren, useLayoutEffect } from 'react';

import { useTheme } from '@/hooks/use-theme';
import { applyDocumentTheme } from '@/store/theme';

export function ThemeProvider({ children }: PropsWithChildren) {
  const { theme } = useTheme();
  useLayoutEffect(() => {
    applyDocumentTheme(theme);
  }, [theme]);
  return children;
}
