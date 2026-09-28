type StatusService = {
  id: string;
  group: string;
  url?: string;
};

export const statusBatchSize = 8;

export function statusLoadLimit(total: number, batch: number) {
  return Math.min(total, statusBatchSize * (Math.max(0, batch) + 1));
}

export function statusLoadBatch(
  services: StatusService[],
  isComplete: (service: StatusService) => boolean,
  filter = '全部'
) {
  const integrated = services.filter(
    (service) => service.url && (filter === '全部' || service.group === filter)
  );
  let batch = 0;
  while (statusLoadLimit(integrated.length, batch) < integrated.length) {
    const start = batch * statusBatchSize;
    const end = Math.min(integrated.length, start + statusBatchSize);
    if (!integrated.slice(start, end).every(isComplete)) break;
    batch += 1;
  }
  return batch;
}

export function statusLoadIds(
  services: StatusService[],
  filter: string,
  detailId: string | null,
  batch: number
) {
  const ids = new Set<string>();
  const integrated = services.filter((service) => service.url);
  const grouped = integrated.filter((service) => service.group === filter);
  const selected =
    filter === '全部'
      ? integrated.slice(0, statusLoadLimit(integrated.length, batch))
      : grouped.slice(0, statusLoadLimit(grouped.length, batch));
  for (const service of selected) ids.add(service.id);
  if (detailId && integrated.some((service) => service.id === detailId)) ids.add(detailId);
  return ids;
}
