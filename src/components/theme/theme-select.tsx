import { type CSSProperties, useEffect, useRef } from 'react';

import { useAtom } from 'jotai';
import { Palette } from 'lucide-react';
import { flushSync } from 'react-dom';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import { SITE_THEMES, type Theme, isTheme, themeTransitionPendingAtom } from '@/store/theme';

type ThemeTransition = {
  ready: Promise<void>;
  finished: Promise<void>;
  skipTransition: () => void;
};
type TransitionDocument = Document & {
  startViewTransition?: (update: () => void) => ThemeTransition;
};

export function ThemeSelect({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [pending, setPending] = useAtom(themeTransitionPendingAtom);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const busy = useRef(false);
  const transitionRef = useRef<ThemeTransition | null>(null);
  const animationRef = useRef<Animation | null>(null);
  const label = t('站点主题');

  useEffect(
    () => () => {
      animationRef.current?.cancel();
      transitionRef.current?.skipTransition();
      busy.current = false;
      setPending(false);
    },
    [setPending]
  );

  async function selectTheme(next: Theme) {
    if (next === theme || busy.current) return;
    const updateTheme = () => flushSync(() => setTheme(next));
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const transitionDocument = document as TransitionDocument;
    if (!transitionDocument.startViewTransition || reduced) {
      document.documentElement.dataset.themeSwitching = '';
      updateTheme();
      delete document.documentElement.dataset.themeSwitching;
      return;
    }

    const rect = triggerRef.current?.getBoundingClientRect();
    const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const y = rect ? rect.top + rect.height / 2 : 0;
    const radius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );
    busy.current = true;
    setPending(true);
    try {
      const transition = transitionDocument.startViewTransition(updateTheme);
      transitionRef.current = transition;
      await transition.ready;
      const animation = document.documentElement.animate(
        {
          clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`],
        },
        {
          duration: 320,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          fill: 'both',
          pseudoElement: '::view-transition-new(root)',
        }
      );
      animationRef.current = animation;
      await animation.finished;
      await transition.finished;
    } catch {
      transitionRef.current?.skipTransition();
      updateTheme();
    } finally {
      animationRef.current = null;
      transitionRef.current = null;
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          ref={triggerRef}
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={pending}
          aria-busy={pending}
          aria-label={label}
          title={label}
          className={cn(
            'shrink-0 rounded-full text-muted-foreground shadow-none md:rounded-lg',
            className
          )}>
          <Palette aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44 w-auto">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => {
            if (isTheme(value)) void selectTheme(value);
          }}>
          {SITE_THEMES.map((item) => (
            <DropdownMenuRadioItem key={item.id} value={item.id}>
              <span
                className="theme-swatch"
                aria-hidden="true"
                style={
                  {
                    '--theme-swatch-bg': item.swatches[0],
                    '--theme-swatch-accent': item.swatches[1],
                  } as CSSProperties
                }
              />
              {t(item.label)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
