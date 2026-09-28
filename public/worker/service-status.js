const PAGE_STATES = {
  UP: { indicator: 'none', description: '正常运行' },
  HASISSUES: { indicator: 'minor', description: '存在服务故障' },
  UNDERMAINTENANCE: { indicator: 'maintenance', description: '维护中' },
};

function toIncident(item) {
  return {
    id: item.id ?? item.url,
    name: item.name,
    status: item.status,
    updated_at: item.updatedAt ?? item.started ?? item.start,
    shortlink: item.url,
  };
}

export function normalizeStatus(data) {
  if (data.status?.indicator) return data;
  const mapped = PAGE_STATES[data.page?.status];
  if (!mapped) return data;

  const open = [
    ...(data.activeIncidents ?? []).filter((item) => item.status !== 'RESOLVED'),
    ...(data.activeMaintenances ?? []).filter((item) => item.status === 'INPROGRESS'),
  ];

  return { status: mapped, incidents: open.map(toIncident) };
}
