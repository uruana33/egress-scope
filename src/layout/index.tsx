import { Suspense, lazy, useRef } from 'react';

import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { Tabs } from 'radix-ui';
import { Toaster } from 'sonner';

import { BuildInfo } from '@/components/build-info';
import { LanguageSelect } from '@/components/language-select';
import { AppUpdateChecker } from '@/components/providers/app-update-checker';
import { SiteBrand } from '@/components/site-brand';
import { ThemeSelect } from '@/components/theme/theme-select';
import { Pending } from '@/components/toolkit';
import { AnimatedSegmentedTabs } from '@/components/ui/animated-segmented-tabs';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/i18n';

import { MobileHeader, SiteFooter, navigationOptions } from './chrome';
import { RouteErrorBoundary } from './route-error-boundary';
import { activeNavigationRoute } from './routes';
import { useActiveTabScroll } from './use-active-tab-scroll';

const MobileNavGlass = lazy(() => import('@/components/mobile-nav-glass'));

export function AppLayout() {
  const { scheme } = useTheme();
  const mobile = useIsMobile();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const navRef = useRef<HTMLElement>(null);
  const activeRoute = activeNavigationRoute(pathname);

  useActiveTabScroll(navRef, pathname);

  return (
    <>
      <div className="app-container">
        <MobileHeader />
        <AnimatedSegmentedTabs
          label={t('网络诊断工具')}
          options={navigationOptions}
          value={activeRoute}
          onValueChange={(value) => {
            if (value !== activeRoute) navigate(value);
          }}
          activationMode="manual"
          className="min-w-0"
          listClassName="h-9 w-max justify-start gap-1 bg-transparent p-0"
          highlightClassName="rounded-full bg-primary/12"
          triggerClassName="h-8 flex-none rounded-full border-0 px-3.5 text-[13px] text-muted-foreground hover:text-foreground hover:bg-accent/40 data-[state=active]:font-bold data-[state=active]:text-primary transition-[color,background-color,transform] duration-150 ease-out"
          renderList={(list) => (
            <nav ref={navRef} className="app-nav" aria-label={t('主导航')}>
              {mobile && (
                <Suspense fallback={null}>
                  <MobileNavGlass light={scheme === 'light'} />
                </Suspense>
              )}
              <SiteBrand className="desktop-site-brand" />
              <ScrollArea className="nav-tabs-scroll">
                {list}
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
              <div className="desktop-preferences flex items-center gap-1.5 pl-2 border-l border-border/40">
                <LanguageSelect />
                <ThemeSelect className="size-8 shrink-0 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/50" />
              </div>
            </nav>
          )}>
          <Tabs.Content value={activeRoute} asChild>
            <main className="outline-none">
              <RouteErrorBoundary key={activeRoute}>
                <Suspense
                  fallback={
                    <p className="status-line">
                      <Pending>{t('正在加载页面…')}</Pending>
                    </p>
                  }>
                  <Outlet />
                </Suspense>
              </RouteErrorBoundary>
            </main>
          </Tabs.Content>
        </AnimatedSegmentedTabs>
        <SiteFooter />
      </div>
      <aside aria-label={t('站点通知')} className="update-notices">
        <AppUpdateChecker />
      </aside>
      <BuildInfo />
      <Toaster richColors theme={scheme} position="top-right" />
    </>
  );
}
