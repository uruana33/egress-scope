import { Component, type PropsWithChildren } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { t } from '@/i18n';

export class RouteErrorBoundary extends Component<PropsWithChildren, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[route-render-error]', {
      name: error instanceof Error ? error.name : 'Error',
      message: error instanceof Error ? error.message : String(error),
    });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <Alert variant="destructive">
        <AlertTitle>{t('加载失败')}</AlertTitle>
        <AlertDescription>
          <p>{t('页面暂时无法显示，请刷新页面重试。')}</p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            {t('刷新页面')}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
}
