import { z } from 'zod';

import type { CoffeeIp } from '../coffee';

/**
 * The upstream is a third party we do not control, so the response is validated
 * before it reaches the view layer. Validation is deliberately narrow: only the
 * fields the page renders as numbers, arrays or gauges are checked, because a
 * wrong type there turns into a wrong reading rather than a missing one.
 * Everything else is passed through untouched so that new upstream fields stay
 * available without a schema change.
 */
const safeArray = <T extends z.ZodTypeAny>(item: T) => z.array(item).optional().catch(undefined);

const looseRecord = z.looseObject({});

/** A score outside 0–100 cannot be drawn on the gauge, so it is dropped. */
const boundedScore = z
  .number()
  .optional()
  .transform((value) =>
    value == null || !Number.isFinite(value) || value < 0 || value > 100 ? undefined : value
  );

const geoSourceSchema = z.looseObject({
  src: z.string().optional(),
  country: z.string().optional(),
  country_code: z.string().optional(),
  region: z.string().optional(),
  city: z.string().optional(),
  lat: z.number().nullish(),
  lon: z.number().nullish(),
});

export const coffeeIpSchema = z.looseObject({
  ip: z.string().min(1),
  trust_score: boundedScore,
  asn: z.number().optional().catch(undefined),
  asn_ipv4_count: z.number().optional().catch(undefined),
  geo_sources: safeArray(geoSourceSchema),
  location_history: safeArray(looseRecord),
  asn_history: safeArray(looseRecord),
  company_history: safeArray(looseRecord),
  dc_neighbors: safeArray(z.looseObject({ ip: z.string() })),
  related_domains: safeArray(z.looseObject({ domain: z.string() })),
  intelligence: z
    .looseObject({ threats: safeArray(z.string()) })
    .optional()
    .catch(undefined),
  ai_verdict: z
    .looseObject({ confidence: z.number().optional().catch(undefined) })
    .optional()
    .catch(undefined),
});

/**
 * Throws when the payload cannot describe an address at all. Callers translate
 * that into a "data source returned an unexpected shape" message instead of
 * rendering values the page cannot trust.
 */
export function parseCoffeeIp(value: unknown): CoffeeIp {
  return coffeeIpSchema.parse(value) as unknown as CoffeeIp;
}
