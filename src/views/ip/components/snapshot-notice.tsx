import { History } from 'lucide-react';

import { t } from '@/i18n';

function describeAge(savedAt: number) {
  const minutes = Math.floor((Date.now() - savedAt) / 60_000);
  if (minutes < 1) return t('刚刚');
  if (minutes < 60) return t('{0} 分钟前', [minutes]);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('{0} 小时前', [hours]);
  return t('{0} 天前', [Math.floor(hours / 24)]);
}

/**
 * The page can render a stored snapshot before the live answer arrives. Without
 * this banner that snapshot is indistinguishable from a fresh result.
 */
export function SnapshotNotice({ savedAt }: { savedAt?: number }) {
  return (
    <p className="snapshot-notice" role="status">
      <History aria-hidden="true" className="size-3.5" />
      <span>
        {savedAt
          ? t('当前显示 {0}保存的结果，正在获取最新数据…', [describeAge(savedAt)])
          : t('当前显示本地缓存结果，正在获取最新数据…')}
      </span>
    </p>
  );
}
