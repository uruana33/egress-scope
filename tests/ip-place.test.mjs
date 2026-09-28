import assert from 'node:assert/strict';
import { test } from 'node:test';

import { consensusPlace, normCity } from '../src/views/ip/model/place.ts';

const IP = '74.120.253.118';

const coffee = {
  ip: IP,
  city: 'Denver (North Capitol Hill)',
  region: 'Colorado',
  country: 'United States',
  countryCode: 'us',
  geo_sources: [
    {
      src: 'g1',
      city: 'Denver (North Capitol Hill)',
      region: 'Colorado',
      country: 'United States',
    },
    { src: 'g2', country: 'United States', lat: 37.751, lon: -97.822 },
    {
      src: 'g3',
      city: 'New York',
      region: 'New York',
      country: 'United States',
      lat: 40.7128,
      lon: -74.006,
    },
  ],
};

function place(source, city, region = 'New York', extra = {}) {
  return {
    source,
    href: `https://example.test/${source}`,
    city,
    region,
    country: 'United States',
    country_code: 'US',
    ...extra,
  };
}

test('New York and New York City count as the same city', () => {
  assert.equal(normCity('New York City'), 'new york');
  assert.equal(normCity('New York'), 'new york');
});

test("the header uses the majority city from the nine-source catalog, not Coffee's primary city", () => {
  const result = consensusPlace(coffee, {
    ip: IP,
    readings: [],
    unavailable: [],
    places: [
      place('ipinfo', 'New York City', 'New York', {
        latitude: 40.71427,
        longitude: -74.00597,
      }),
      place('ip2location', 'New York City'),
      place('ipapi', 'New York', 'New York', {
        latitude: 40.7128,
        longitude: -74.006,
      }),
      place('proxycheck', 'New York', 'New York', {
        latitude: 40.7128,
        longitude: -74.006,
      }),
    ],
  });

  assert.equal(result.city, 'New York');
  assert.equal(result.region, 'New York');
  assert.equal(result.country, 'United States');
  assert.equal(result.split, true);
  assert.equal(result.located, 5);
  assert.match(result.line, /New York/);
  assert.ok(!result.line.includes('Denver'));
  assert.ok(result.latitude != null && result.latitude > 40 && result.latitude < 41);
  assert.ok(result.longitude != null && result.longitude < -73);
  assert.equal(
    result.votes.find((item) => item.id === 'coffee')?.city,
    'Denver (North Capitol Hill)'
  );
  assert.equal(result.votes.find((item) => item.id === 'ipqs')?.status, 'outbound');
});

test("Coffee's US-centroid coordinates are not used for a Denver label", () => {
  const result = consensusPlace(coffee, {
    ip: IP,
    readings: [],
    unavailable: [],
    places: [],
  });
  assert.equal(result.city, 'Denver (North Capitol Hill)');
  assert.equal(result.latitude, undefined);
  assert.equal(result.longitude, undefined);
});

test('one located source is reported as a single observation, not a majority', () => {
  const result = consensusPlace(
    {
      ...coffee,
      city: undefined,
      region: undefined,
      country: undefined,
      countryCode: undefined,
      geo_sources: [],
    },
    {
      ip: IP,
      readings: [],
      unavailable: [],
      places: [place('ipinfo', 'New York')],
    }
  );
  assert.equal(result.city, 'New York');
  assert.equal(result.located, 1);
  assert.equal(result.split, false);
});

test('matching city names do not conceal conflicting regions or mix coordinates', () => {
  const result = consensusPlace(
    {
      ip: IP,
      city: 'Springfield',
      region: 'Illinois',
      country: 'United States',
      countryCode: 'us',
    },
    {
      ip: IP,
      readings: [],
      unavailable: [],
      places: [
        place('ipinfo', 'Springfield', 'Missouri', {
          latitude: 37.2,
          longitude: -93.3,
        }),
        place('ip2location', 'Springfield', 'Illinois', {
          latitude: 39.8,
          longitude: -89.6,
        }),
      ],
    }
  );
  assert.equal(result.split, true);
  assert.equal(result.region, 'Illinois');
  assert.equal(result.latitude, 39.8);
  assert.equal(result.longitude, -89.6);
});

test('matching city names in different countries stay disputed', () => {
  const result = consensusPlace(
    { ip: IP, city: 'London', country: 'United Kingdom', countryCode: 'gb' },
    {
      ip: IP,
      readings: [],
      unavailable: [],
      places: [
        place('ipinfo', 'London', 'Ontario', {
          country: 'Canada',
          country_code: 'CA',
        }),
      ],
    }
  );
  assert.equal(result.split, true);
});
