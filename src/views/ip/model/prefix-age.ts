export interface PrefixAge {
  registeredAt: string;
  start?: string;
  end?: string;
  handle?: string;
  cidr?: string;
}

export function prefixAgeDays(registeredAt: string | undefined, now = Date.now()): number | null {
  if (!registeredAt) return null;
  const stamp = Date.parse(registeredAt);
  if (!Number.isFinite(stamp)) return null;
  return Math.floor((now - stamp) / 86_400_000);
}
