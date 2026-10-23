export type WeatherLocation = { latitude: number; longitude: number; accuracy?: number };

export type ValidatedWeather = {
  date: string;
  timezone: string;
  latitude: number;
  longitude: number;
  highC: number;
  lowC: number;
  precipitationProbability: number | null;
  windKmh: number | null;
  weatherCode: number;
  condition: string;
  icon: "sunny" | "partly-cloudy" | "cloudy" | "rain";
};

type RawWeather = {
  latitude?: number;
  longitude?: number;
  timezone?: string;
  daily?: Record<string, unknown>;
};

const WEATHER_CODES = new Set([0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99]);

function numberAt(value: unknown, index: number): number | null {
  const item = Array.isArray(value) ? value[index] : undefined;
  return typeof item === "number" && Number.isFinite(item) ? item : null;
}

function tomorrowInTimezone(timezone: string, now = new Date()): string {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const [year, month, day] = date.split("-").map(Number);
  const tomorrow = new Date(Date.UTC(year, month - 1, day + 1));
  return tomorrow.toISOString().slice(0, 10);
}

function conditionFor(code: number): Pick<ValidatedWeather, "condition" | "icon"> {
  if (code >= 51) return { condition: code >= 80 ? "Záporos vagy esős" : "Esős", icon: "rain" };
  if (code === 3 || code === 45 || code === 48) return { condition: "Felhős", icon: "cloudy" };
  if (code === 1 || code === 2) return { condition: "Részben felhős", icon: "partly-cloudy" };
  return { condition: "Napos", icon: "sunny" };
}

export function validateTomorrowForecast(raw: RawWeather, now = new Date(), expectedLocation?: WeatherLocation): ValidatedWeather {
  const daily = raw.daily;
  const timezone = typeof raw.timezone === "string" && raw.timezone ? raw.timezone : "UTC";
  if (expectedLocation && (typeof raw.latitude !== "number" || typeof raw.longitude !== "number" || Math.hypot(raw.latitude - expectedLocation.latitude, raw.longitude - expectedLocation.longitude) > 0.5)) throw new Error("Weather response location does not match request");
  if (!daily || !Array.isArray(daily.time)) throw new Error("Weather response is missing daily dates");
  const date = tomorrowInTimezone(timezone, now);
  const index = daily.time.indexOf(date);
  if (index < 0) throw new Error(`Weather response does not contain tomorrow (${date})`);
  const highC = numberAt(daily.temperature_2m_max, index);
  const lowC = numberAt(daily.temperature_2m_min, index);
  const code = numberAt(daily.weather_code, index);
  const precipitation = numberAt(daily.precipitation_probability_max, index);
  const wind = numberAt(daily.wind_speed_10m_max, index);
  if (highC === null || lowC === null || code === null) throw new Error("Weather response is missing required tomorrow values");
  if (highC < lowC || highC < -90 || highC > 70 || lowC < -90 || lowC > 70) throw new Error("Weather response has invalid temperatures");
  if (!WEATHER_CODES.has(code)) throw new Error("Weather response has an unknown weather code");
  if (precipitation !== null && (precipitation < 0 || precipitation > 100)) throw new Error("Weather response has invalid precipitation probability");
  if (wind !== null && (wind < 0 || wind > 400)) throw new Error("Weather response has invalid wind speed");
  return { date, timezone, latitude: raw.latitude ?? 0, longitude: raw.longitude ?? 0, highC, lowC, precipitationProbability: precipitation, windKmh: wind, weatherCode: code, ...conditionFor(code) };
}

export function weatherCardMarker(weather: ValidatedWeather, locationName = "Helyi előrejelzés"): string {
  return `<!--WEATHER_CARD ${JSON.stringify({ location: locationName, day: "Holnap", date: weather.date, condition: weather.condition, icon: weather.icon, high: `${weather.highC}°C`, low: `${weather.lowC}°C`, rain: weather.precipitationProbability === null ? null : `${weather.precipitationProbability}%`, wind: weather.windKmh === null ? null : `${weather.windKmh} km/h`, summary: "" })}-->`;
}
