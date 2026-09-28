import { useQueries, useQuery } from '@tanstack/react-query';

import {
  currentHttpExits,
  currentReference,
  httpReferenceGeoQuery,
  httpReferenceQueries,
} from './http-reference';

export function useEgressHttpExits(scope: 'dns' | 'cdn', round: number) {
  const references = useQueries({
    queries: httpReferenceQueries(scope, round),
  });
  const [domestic, overseas] = references.map(currentReference);
  const ips = [domestic?.ip !== overseas?.ip ? domestic?.ip : undefined, overseas?.ip];
  const domesticGeo = useQuery(httpReferenceGeoQuery(scope, round, ips[0]));
  const overseasGeo = useQuery(httpReferenceGeoQuery(scope, round, ips[1]));
  const geos = [domesticGeo, overseasGeo];
  return {
    httpExits: currentHttpExits(references, geos),
    busy: [...references, ...geos].some((query) => query.isFetching),
  };
}
