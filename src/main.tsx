import React from 'react';

import { BrowserRouter } from 'react-router-dom';

import { Provider } from 'jotai';
import ReactDOM from 'react-dom/client';

import { App } from '@/App';
import '@/app.css';
import { QueryProvider } from '@/components/providers/query-provider';
import { RouteProgress } from '@/components/providers/route-progress';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { initializeLocale } from '@/i18n';
import { installPreloadRecovery } from '@/lib/preload-recovery';

installPreloadRecovery(window, import.meta.env.VITE_BUILD_TIME);
initializeLocale();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider>
      <ThemeProvider>
        <BrowserRouter>
          <RouteProgress />
          <QueryProvider>
            <App />
          </QueryProvider>
        </BrowserRouter>
      </ThemeProvider>
    </Provider>
  </React.StrictMode>
);
