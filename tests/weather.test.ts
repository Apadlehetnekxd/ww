import test from "node:test";
import assert from "node:assert/strict";
import { validateTomorrowForecast } from "../src/lib/weather.ts";

const now = new Date("2026-10-17T12:00:00Z");
const raw = (overrides: Record<string, unknown> = {}) => ({
  latitude: 47.5,
  longitude: 19.04,
  timezone: "Europe/Budapest",
  daily: {
    time: ["2026-10-17", "2026-10-18"],
    temperature_2m_max: [18, 15],
    temperature_2m_min: [8, 5],
    precipitation_probability_max: [10, 20],
    wind_speed_10m_max: [12, 24],
    weather_code: [1, 61],
    ...overrides,
  },
});

test("uses the actual tomorrow date and tomorrow values", () => {
  const result = validateTomorrowForecast(raw(), now);
  assert.equal(result.date, "2026-10-18");
  assert.equal(result.highC, 15);
  assert.equal(result.lowC, 5);
  assert.equal(result.precipitationProbability, 20);
});

test("rejects a response whose dates do not contain tomorrow", () => {
  assert.throws(() => validateTomorrowForecast(raw({ time: ["2026-10-17", "2026-10-19"] }), now), /tomorrow/);
});

test("rejects a location mismatch", () => {
  assert.throws(() => validateTomorrowForecast({ ...raw(), latitude: 0, longitude: 0 }, now, { latitude: 47.5, longitude: 19.04 }), /location/i);
});

test("rejects swapped minimum and maximum values", () => {
  assert.throws(() => validateTomorrowForecast(raw({ temperature_2m_max: [18, 4], temperature_2m_min: [8, 12] }), now), /temperatures/);
});

test("rejects impossible precipitation and temperature values", () => {
  assert.throws(() => validateTomorrowForecast(raw({ precipitation_probability_max: [10, 101] }), now), /precipitation/);
  assert.throws(() => validateTomorrowForecast(raw({ temperature_2m_max: [18, 91] }), now), /temperatures/);
});

test("preserves missing precipitation as unavailable instead of guessing", () => {
  const result = validateTomorrowForecast(raw({ precipitation_probability_max: [10, null] } as Record<string, unknown>), now);
  assert.equal(result.precipitationProbability, null);
});
