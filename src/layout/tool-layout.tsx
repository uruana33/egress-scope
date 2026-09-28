import { type ComponentType, Fragment } from 'react';

import { NavLink, Outlet } from 'react-router-dom';

import { ArrowRightFromLine } from 'lucide-react';

import { t } from '@/i18n';

import { toolGroups } from './routes';

/** Paths that start a new section in the subnav: a divider is inserted. */
const subnavBreaks: Record<string, string[]> = {};

const toolIcons: Record<string, ComponentType<{ className?: string }>> = {
  '/network/egress': ArrowRightFromLine,
};

export function ToolLayout({ group }: { group: keyof typeof toolGroups }) {
  const tools = toolGroups[group];

  if (group === 'ai' || tools.length <= 1)
    return (
      <div className="tool-layout tool-layout-flat">
        <div className="tool-content">
          <Outlet />
        </div>
      </div>
    );

  return (
    <div className="tool-layout">
      <nav className="tool-subnav" aria-label={t('工具导航')}>
        {tools.map((tool) => {
          const Icon = toolIcons[tool.path];
          const breaks = subnavBreaks[group] ?? [];

          return (
            <Fragment key={tool.path}>
              {breaks.includes(tool.path) ? (
                <span className="tool-subnav-divider" aria-hidden="true" />
              ) : null}
              <NavLink to={tool.path} className="flex items-center gap-1.5">
                {Icon ? <Icon className="size-3.5 shrink-0 opacity-70" /> : null}
                <span>{tool.label}</span>
              </NavLink>
            </Fragment>
          );
        })}
      </nav>
      <div className="tool-content">
        <Outlet />
      </div>
    </div>
  );
}
