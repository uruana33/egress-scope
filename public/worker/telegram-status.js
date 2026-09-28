import { HttpError } from './http.js';

const MONITOR_SLUG = 'telegram';
const MONITOR_URL = 'telegram.org';
const VALID_STATES = ['UP', 'DOWN'];
const MAX_AGE_MS = 30 * 60_000;
const FUTURE_SKEW_MS = 60_000;

// UptimeRobot's public monitor checks telegram.org every 10 minutes.
// Its website probe must not be presented as Telegram messaging health.
export function parseTelegramStatus(data, now = Date.now()) {
  const checkedAt = Date.parse(data?.lastCheck);
  const usable =
    data?.slug === MONITOR_SLUG &&
    data?.url === MONITOR_URL &&
    VALID_STATES.includes(data?.status) &&
    Number.isFinite(checkedAt) &&
    checkedAt <= now + FUTURE_SKEW_MS &&
    now - checkedAt <= MAX_AGE_MS;
  if (!usable) throw new HttpError(502, '第三方状态数据暂不可用');

  const up = data.status === 'UP';
  return {
    status: {
      indicator: up ? 'none' : 'major',
      description: up ? '第三方网站监测正常' : '第三方网站监测异常',
    },
    checkedAt: new Date(checkedAt).toISOString(),
    components: [
      {
        id: 'telegram-website',
        name: 'telegram.org (UptimeRobot)',
        status: up ? 'operational' : 'major_outage',
      },
    ],
  };
}
