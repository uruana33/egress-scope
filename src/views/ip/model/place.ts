import { t } from '@/i18n';
import { type CatalogSourceId, type SourceDef, sourceCatalog } from '@/views/ip/model/cross-checks';
import { type CrossIntel, type CrossPlace, coffeeHref } from '@/views/ip/model/cross-intel';

import type { CoffeeIp } from '../coffee';

export type PlaceStatus = 'ready' | 'pending' | 'unavailable' | 'outbound';

export interface PlaceVote {
  id: CatalogSourceId;
  name: string;
  href: string;
  status: PlaceStatus;
  city?: string;
  region?: string;
  country?: string;
  country_code?: string;
  latitude?: number;
  longitude?: number;
}

export interface PlaceConsensus {
  city?: string;
  region?: string;
  country?: string;
  country_code?: string;
  latitude?: number;
  longitude?: number;
  line: string;
  split: boolean;
  pending: boolean;
  located: number;
  total: number;
  votes: PlaceVote[];
}

function text(value?: string) {
  const next = value?.replace(/\s+/g, ' ').trim();
  return next || undefined;
}

export function normCity(value: string) {
  return value
    .toLowerCase()
    .replace(/[(),]/g, ' ')
    .replace(/\b(?:city|stadt|shi)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normCountry(value: string) {
  const key = value
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\bof america\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (key === 'us' || key === 'usa' || key === 'united states') return 'united states';
  return key;
}

export function normRegion(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function uniqueLine(...parts: (string | undefined)[]) {
  return parts
    .filter((value): value is string => !!value)
    .filter((value, index, all) => all.indexOf(value) === index)
    .join(' · ');
}

function coffeeCoords(coffee: CoffeeIp) {
  const key = coffee.city ? normCity(coffee.city) : '';
  if (!key) return {};
  const hit = coffee.geo_sources?.find(
    (item) =>
      item.city &&
      normCity(item.city) === key &&
      typeof item.lat === 'number' &&
      typeof item.lon === 'number'
  );
  if (!hit) return {};
  return { latitude: hit.lat ?? undefined, longitude: hit.lon ?? undefined };
}

function coffeeVote(coffee: CoffeeIp, def: SourceDef): PlaceVote {
  return {
    id: 'coffee',
    name: def.name,
    href: def.href || coffeeHref(coffee.ip),
    status: 'ready',
    city: text(coffee.city),
    region: text(coffee.region),
    country: text(coffee.country),
    country_code: text(coffee.countryCode)?.toUpperCase(),
    ...coffeeCoords(coffee),
  };
}

function fromPlace(def: SourceDef, row: CrossPlace): PlaceVote {
  return {
    id: def.id,
    name: def.name,
    href: row.href || def.href,
    status: 'ready',
    city: text(row.city),
    region: text(row.region),
    country: text(row.country),
    country_code: text(row.country_code)?.toUpperCase(),
    latitude: row.latitude,
    longitude: row.longitude,
  };
}

function silentVote(def: SourceDef, status: PlaceStatus): PlaceVote {
  return { id: def.id, name: def.name, href: def.href, status };
}

export function placeVotes(
  coffee: CoffeeIp,
  intel: CrossIntel | null,
  pending: boolean
): PlaceVote[] {
  const found = new Map<string, CrossPlace>((intel?.places ?? []).map((row) => [row.source, row]));
  const unavailable = new Set<string>(intel?.unavailable ?? []);
  return sourceCatalog(coffee.ip)
    .filter((def) => def.geo !== false)
    .map((def) => {
      if (def.id === 'coffee') return coffeeVote(coffee, def);
      const row = found.get(def.id);
      if (row) return fromPlace(def, row);
      if (!def.auto) return silentVote(def, 'outbound');
      if (pending && !intel) return silentVote(def, 'pending');
      return silentVote(def, unavailable.has(def.id) || intel ? 'unavailable' : 'pending');
    });
}

type PlaceField = 'city' | 'region' | 'country';

function keyFor(field: PlaceField, value: string) {
  if (field === 'city') return normCity(value);
  if (field === 'country') return normCountry(value);
  return normRegion(value);
}

function pickField(votes: PlaceVote[], field: PlaceField) {
  const buckets = new Map<string, { count: number; labels: Map<string, number>; first: number }>();
  votes.forEach((vote, index) => {
    const raw = text(vote[field]);
    if (!raw) return;
    const key = keyFor(field, raw);
    if (!key) return;
    const bucket = buckets.get(key) ?? {
      count: 0,
      labels: new Map<string, number>(),
      first: index,
    };
    bucket.count += 1;
    bucket.labels.set(raw, (bucket.labels.get(raw) ?? 0) + 1);
    buckets.set(key, bucket);
  });
  const ranked = [...buckets.entries()].sort(
    (left, right) => right[1].count - left[1].count || left[1].first - right[1].first
  );
  const top = ranked[0]?.[1];
  if (!top) return { value: undefined as string | undefined, split: false };
  const label = [...top.labels.entries()].sort(
    (left, right) => right[1] - left[1] || left[0].length - right[0].length
  )[0]?.[0];
  return {
    value: label,
    split: ranked.length > 1,
  };
}

function meanCoord(votes: PlaceVote[], axis: 'latitude' | 'longitude') {
  const values = votes
    .map((vote) => vote[axis])
    .filter((value): value is number => typeof value === 'number');
  if (!values.length) return undefined;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 1e6) / 1e6;
}

export function consensusPlace(
  coffee: CoffeeIp,
  intel: CrossIntel | null = null,
  pending = false
): PlaceConsensus {
  const votes = placeVotes(coffee, intel, pending);
  const ready = votes.filter(
    (vote) => vote.status === 'ready' && (vote.city || vote.region || vote.country)
  );
  const withCity = ready.filter((vote) => vote.city);
  const city = pickField(withCity, 'city');
  const cityKey = city.value ? normCity(city.value) : '';
  const winners = cityKey
    ? withCity.filter((vote) => vote.city && normCity(vote.city) === cityKey)
    : ready;
  const country = pickField(winners, 'country');
  const countryWinners = winners.filter(
    (vote) =>
      !country.value || !vote.country || normCountry(vote.country) === normCountry(country.value)
  );
  const region = pickField(countryWinners, 'region');
  const coordinateWinners = countryWinners.filter(
    (vote) => !region.value || !vote.region || normRegion(vote.region) === normRegion(region.value)
  );
  const code = coordinateWinners.find((vote) => vote.country_code)?.country_code;
  const line = uniqueLine(city.value, region.value, country.value) || t('未知位置');
  return {
    city: city.value,
    region: region.value,
    country: country.value,
    country_code: code,
    latitude: meanCoord(coordinateWinners, 'latitude'),
    longitude: meanCoord(coordinateWinners, 'longitude'),
    line,
    split: city.split || pickField(ready, 'country').split || pickField(ready, 'region').split,
    pending: pending && !intel,
    located: withCity.length,
    total: votes.length,
    votes,
  };
}
