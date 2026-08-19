const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const latitude = Number(searchParams.get("lat"));
  const longitude = Number(searchParams.get("lon"));
  const hours = Number(searchParams.get("hours") ?? "0");
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < 25.4 ||
    latitude > 26.1 ||
    longitude < -80.6 ||
    longitude > -79.8 ||
    ![0, 1, 3].includes(hours)
  ) {
    return Response.json(
      { error: true, message: "The Miami forecast request is invalid." },
      { status: 400 },
    );
  }

  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: "temperature_2m,apparent_temperature,relative_humidity_2m",
    hourly: "temperature_2m,apparent_temperature,relative_humidity_2m",
    temperature_unit: "celsius",
    timezone: "America/New_York",
    timeformat: "unixtime",
    forecast_hours: "12",
  });
  const response = await fetch(`${FORECAST_URL}?${params}`, {
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.current || !Array.isArray(payload?.hourly?.time)) {
    return Response.json(
      { error: true, message: payload?.reason ?? "Forecast data is unavailable." },
      { status: response.status || 502 },
    );
  }

  const targetTime = Date.now() / 1000 + hours * 3600;
  const times: number[] = payload.hourly.time;
  let index = times.findIndex((time) => time >= targetTime);
  if (index < 0) index = times.length - 1;
  const temperatureC = Number(payload.hourly.temperature_2m?.[index]);
  const currentTemperatureC = Number(payload.current.temperature_2m);

  return Response.json({
    source: "open-meteo",
    generatedAt: new Date().toISOString(),
    validAt: new Date(times[index] * 1000).toISOString(),
    hours,
    currentTemperatureC,
    temperatureC,
    apparentTemperatureC: Number(payload.hourly.apparent_temperature?.[index]),
    relativeHumidity: Number(payload.hourly.relative_humidity_2m?.[index]),
    deltaC: Number((temperatureC - currentTemperatureC).toFixed(1)),
  });
}
