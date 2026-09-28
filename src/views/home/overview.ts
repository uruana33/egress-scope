export interface HomeProbe {
  data?: { ip: string };
  isPending?: boolean;
  isFetching?: boolean;
  isError?: boolean;
}

function usable(probe: HomeProbe | undefined) {
  return !!probe?.data?.ip && !probe.data.ip.includes(':');
}

export function selectHomeCards<T extends HomeProbe>(probes: readonly T[]) {
  const same =
    usable(probes[0]) &&
    usable(probes[1]) &&
    !probes[0].isError &&
    !probes[1].isError &&
    !probes[0].isFetching &&
    !probes[1].isFetching &&
    probes[0].data!.ip === probes[1].data!.ip;
  return probes.slice(0, 2).flatMap((query, index) => {
    if (!usable(query) || (index === 1 && same)) return [];
    return [
      {
        query,
        data: query.data!,
        role: same
          ? ('shared' as const)
          : index === 0
            ? ('domestic' as const)
            : ('external' as const),
      },
    ];
  });
}

export function assessHomeExits(probes: readonly HomeProbe[]) {
  if (probes.some((probe) => probe.isPending || probe.isFetching)) return 'pending';
  const valid = probes
    .slice(0, 2)
    .map((probe) => (usable(probe) && !probe.isError ? probe.data!.ip : null));
  if (valid.every(Boolean) && valid.length === 2)
    return valid[0] === valid[1] ? 'same' : 'different';
  return valid.some(Boolean) ? 'partial' : 'empty';
}
