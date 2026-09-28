type FleetProbe = {
  median: number | null | undefined;
  status: 'response' | 'restricted' | 'unknown';
};

export function summarizeCampResults(items: readonly FleetProbe[]) {
  const responded = items.filter((item) => item.status === 'response' && item.median != null);
  const restricted = items.filter((item) => item.status === 'restricted');
  const unconfirmed = items.filter(
    (item) => item.status !== 'restricted' && !(item.status === 'response' && item.median != null)
  );
  return {
    responded: responded.length,
    unconfirmed: unconfirmed.length,
    restricted: restricted.length,
    total: items.length,
    avg: responded.length
      ? Math.round(responded.reduce((sum, item) => sum + item.median!, 0) / responded.length)
      : null,
  };
}
