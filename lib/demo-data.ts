import { chooseCoolestSafeRoute, scoreRoute } from "./thermal";
import type {
  Coordinate,
  HeatPoint,
  RiderProfile,
  RouteAnalysis,
  TravelMode,
} from "./types";

export const DEFAULT_ORIGIN: Coordinate = [-73.9855, 40.758];
export const DEFAULT_DESTINATION: Coordinate = [-73.9754, 40.6826];

export const DEFAULT_PROFILE: RiderProfile = {
  acclimatized: true,
  carryingLoadKg: 4,
  shiftMinutesCompleted: 132,
  hydrationMl: 750,
};

export function createDemoHeatPoints(): HeatPoint[] {
  const west = -74.01;
  const south = 40.67;
  const columns = 12;
  const rows = 12;
  const longitudeStep = 0.005;
  const latitudeStep = 0.009;
  const points: HeatPoint[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const riverCooling = column < 2 || column > 9 ? -1.6 : 0;
      const parkCooling = column > 5 && row > 8 ? -2.1 : 0;
      const asphaltHeat = column > 2 && column < 7 && row > 4 ? 2.7 : 0;
      const variation = Math.sin(row * 1.7 + column * 0.9) * 1.1;
      points.push({
        id: `demo-${row}-${column}`,
        coordinate: [
          west + column * longitudeStep,
          south + row * latitudeStep,
        ],
        temperatureC: round(
          33.2 + riverCooling + parkCooling + asphaltHeat + variation,
          1,
        ),
        source: "demo",
      });
    }
  }

  return points;
}

export function createDemoAnalysis(
  mode: TravelMode,
  heatPoints = createDemoHeatPoints(),
  profile = DEFAULT_PROFILE,
): RouteAnalysis {
  const speedFactor = mode === "walking" ? 2.1 : 1;
  const routeInputs = [
    {
      id: "cool-corridor",
      name: "Cool corridor",
      coordinates: [
        DEFAULT_ORIGIN,
        [-73.9818, 40.7501],
        [-73.9904, 40.7286],
        [-73.9918, 40.7134],
        [-73.9867, 40.7006],
        DEFAULT_DESTINATION,
      ] as Coordinate[],
      durationSeconds: 37.8 * 60 * speedFactor,
      distanceMeters: 10_420,
      steps: [
        {
          instruction: "Use the protected southbound corridor",
          distanceM: 3_150,
          durationS: 690 * speedFactor,
        },
        {
          instruction: "Cross by the lower-heat bridge approach",
          distanceM: 3_220,
          durationS: 720 * speedFactor,
        },
        {
          instruction: "Continue toward Downtown Brooklyn",
          distanceM: 4_050,
          durationS: 858 * speedFactor,
        },
      ],
    },
    {
      id: "fastest",
      name: "Fastest",
      coordinates: [
        DEFAULT_ORIGIN,
        [-73.9875, 40.7398],
        [-73.995, 40.718],
        [-73.9884, 40.6977],
        DEFAULT_DESTINATION,
      ] as Coordinate[],
      durationSeconds: 34.4 * 60 * speedFactor,
      distanceMeters: 9_780,
      steps: [
        {
          instruction: "Take the direct Broadway corridor",
          distanceM: 5_340,
          durationS: 1_040 * speedFactor,
        },
        {
          instruction: "Continue to the delivery stop",
          distanceM: 4_440,
          durationS: 1_024 * speedFactor,
        },
      ],
    },
    {
      id: "river-shade",
      name: "River shade",
      coordinates: [
        DEFAULT_ORIGIN,
        [-74.0047, 40.7415],
        [-74.0101, 40.7185],
        [-74.0032, 40.7032],
        [-73.9902, 40.6915],
        DEFAULT_DESTINATION,
      ] as Coordinate[],
      durationSeconds: 42.6 * 60 * speedFactor,
      distanceMeters: 11_460,
      steps: [
        {
          instruction: "Move toward the Hudson cooling corridor",
          distanceM: 3_650,
          durationS: 780 * speedFactor,
        },
        {
          instruction: "Follow the shaded waterfront approach",
          distanceM: 4_210,
          durationS: 940 * speedFactor,
        },
        {
          instruction: "Turn inland for the final stop",
          distanceM: 3_600,
          durationS: 836 * speedFactor,
        },
      ],
    },
  ];

  const candidates = routeInputs.map((route) =>
    scoreRoute(route, heatPoints, profile),
  );
  const recommended = chooseCoolestSafeRoute(candidates) ?? candidates[0];

  return {
    candidates,
    recommendedRouteId: recommended.id,
    generatedAt: new Date().toISOString(),
    dataMode: heatPoints.some((point) => point.source === "fortyguard")
      ? "live"
      : "demo",
  };
}

export const COOLING_STOPS = [
  {
    id: "stop-1",
    name: "Bryant Park shade stop",
    coordinate: [-73.9832, 40.7536] as Coordinate,
    type: "shade",
    note: "Covered seating and bottle refill",
  },
  {
    id: "stop-2",
    name: "Pacific Library indoor stop",
    coordinate: [-73.9784, 40.6862] as Coordinate,
    type: "indoor",
    note: "Air-conditioned public lobby",
  },
];

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
