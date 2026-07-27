import { mkdir, writeFile } from "node:fs/promises";

const API_BASE_URL = "https://api.fortyguard.com/v1";
const API_KEY = process.env.FORTYGUARD_API_KEY?.trim();
const POLL_INTERVAL_MS = positiveInteger(
  process.env.FORTYGUARD_POLL_INTERVAL_MS,
  10_000,
);
const POLL_TIMEOUT_MS = positiveInteger(
  process.env.FORTYGUARD_POLL_TIMEOUT_MS,
  300_000,
);

// Roughly 1.4 km² across Downtown Miami and the north edge of Brickell.
// GeoJSON coordinates are [longitude, latitude].
const MIAMI_AOI = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        name: "Downtown Miami probe AOI",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-80.1984, 25.7672],
            [-80.1868, 25.7672],
            [-80.1868, 25.778],
            [-80.1984, 25.778],
            [-80.1984, 25.7672],
          ],
        ],
      },
    },
  ],
};

if (!API_KEY) {
  console.error(
    "Missing FORTYGUARD_API_KEY. Copy .env.example to .env.local and add the key.",
  );
  process.exitCode = 1;
} else {
  await runProbe();
}

async function runProbe() {
  const dateTime = previousCompletedHourInMiami();
  const requestBody = {
    polygon_aoi: MIAMI_AOI,
    date_time: {
      start_date: dateTime.date,
      start_time: dateTime.time,
      filter_type: 1,
    },
    granularity: 60,
    analytic_type: "tcm",
  };

  console.log("Submitting FortyGuard Miami heatmap probe...");
  console.log(
    JSON.stringify(
      {
        aoi: MIAMI_AOI.features[0].properties.name,
        date_time: requestBody.date_time,
        granularity_m: requestBody.granularity,
      },
      null,
      2,
    ),
  );

  const submitted = await requestJson(`${API_BASE_URL}/heatmap`, {
    method: "POST",
    body: JSON.stringify(requestBody),
  });

  const activityId = submitted?.data?.activity_id;
  if (!activityId) {
    throw new Error(
      `Heatmap submission succeeded but returned no activity_id: ${JSON.stringify(submitted)}`,
    );
  }

  console.log(`Activity ${activityId} submitted. Polling for completion...`);
  const completed = await pollActivity(activityId);

  await mkdir("artifacts", { recursive: true });
  const outputPath = "artifacts/fortyguard-miami-probe.json";
  await writeFile(outputPath, `${JSON.stringify(completed, null, 2)}\n`, "utf8");

  const summary = summarizeResult(completed);
  console.log("\nMiami probe completed:");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Raw response saved to ${outputPath}`);
}

async function pollActivity(activityId) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const response = await requestJson(
      `${API_BASE_URL}/status/${encodeURIComponent(activityId)}`,
      { method: "GET" },
    );
    const status = response?.data?.status ?? response?.message ?? "Unknown";
    console.log(`[${new Date().toISOString()}] ${status}`);

    if (String(status).toLowerCase() === "completed") {
      return response;
    }
    if (String(status).toLowerCase() === "failed") {
      throw new Error(`FortyGuard activity failed: ${JSON.stringify(response)}`);
    }

    await delay(POLL_INTERVAL_MS);
  }

  throw new Error(
    `Timed out after ${Math.round(POLL_TIMEOUT_MS / 1000)} seconds waiting for the activity.`,
  );
}

async function requestJson(url, options) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "api-key": API_KEY,
      "content-type": "application/json",
      accept: "application/json",
      ...options.headers,
    },
  });

  if (response.status === 429) {
    const retryAfterSeconds = Number(response.headers.get("retry-after") ?? 10);
    await delay(
      Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1000 : 10_000,
    );
    return requestJson(url, options);
  }

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text.slice(0, 1_000) };
  }

  if (!response.ok || payload?.error === true) {
    throw new Error(
      `FortyGuard ${options.method} ${new URL(url).pathname} failed (${response.status}): ${JSON.stringify(payload)}`,
    );
  }

  return payload;
}

function summarizeResult(response) {
  const result = response?.data?.result ?? {};
  const mapData = result.map_data ?? {};
  const features = Array.isArray(mapData.features) ? mapData.features : [];
  const propertyKeys = [
    ...new Set(features.flatMap((feature) => Object.keys(feature.properties ?? {}))),
  ].sort();

  const bboxAreaKm2 = approximateAoiAreaKm2(
    MIAMI_AOI.features[0].geometry.coordinates[0],
  );

  return {
    status: response?.data?.status ?? response?.message,
    activity_id: response?.data?.activity_id,
    tile_count: features.length,
    approximate_aoi_area_km2: round(bboxAreaKm2, 3),
    tiles_per_km2: bboxAreaKm2
      ? round(features.length / bboxAreaKm2, 1)
      : null,
    property_keys: propertyKeys,
    temperature_stats:
      result.stats_data?.Temperature_stats ??
      result.stats_data?.temperature_stats ??
      null,
  };
}

function previousCompletedHourInMiami(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(now.getTime() - 60 * 60 * 1000))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:00`,
  };
}

function approximateAoiAreaKm2(ring) {
  const longitudes = ring.map(([longitude]) => longitude);
  const latitudes = ring.map(([, latitude]) => latitude);
  const west = Math.min(...longitudes);
  const east = Math.max(...longitudes);
  const south = Math.min(...latitudes);
  const north = Math.max(...latitudes);
  const centerLatitudeRadians = ((south + north) / 2) * (Math.PI / 180);
  const widthKm = (east - west) * 111.32 * Math.cos(centerLatitudeRadians);
  const heightKm = (north - south) * 110.574;
  return widthKm * heightKm;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
