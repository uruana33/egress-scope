import { t } from '@/i18n';

import type { EvidenceState } from './scenario-evidence';

export const stateLabels: Record<EvidenceState, string> = {
  unmeasured: t('待检测'),
  running: t('检测中…'),
  complete: t('已取得证据'),
  partial: t('证据不完整'),
  failed: t('请求被拒绝'),
  'rate-limited': t('检测限流'),
  unverifiable: t('无法核验'),
  mismatch: t('出口不匹配'),
  expired: t('结果已过期'),
  cancelled: t('已取消'),
};

export const stateTone = (state: EvidenceState) =>
  ['unmeasured', 'cancelled', 'unverifiable'].includes(state)
    ? 'secondary'
    : state === 'complete'
      ? 'success'
      : state === 'failed'
        ? 'danger'
        : ['partial', 'mismatch', 'expired', 'rate-limited'].includes(state)
          ? 'warning'
          : 'info';

export const metricLabels: Record<string, string> = {
  latency: t('空载延迟'),
  jitter: t('抖动'),
  download: t('下载速度'),
  upload: t('上传速度'),
  downLoadedLatency: t('下载负载延迟'),
  upLoadedLatency: t('上传负载延迟'),
  packetLoss: t('UDP 丢包率'),
  latencySamples: t('延迟样本不足'),
  packetSamples: t('UDP 样本不足'),
  loadedSamples: t('负载延迟样本不足'),
  downloadSamples: t('下载样本不足'),
  uploadSamples: t('上传样本不足'),
  aimScore: t('AIM 评分未产生'),
};
