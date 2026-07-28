export type Coordinate = [longitude: number, latitude: number];

export type TravelMode = "cycling" | "walking";

export interface HeatPoint {
  id: string;
  coordinate: Coordinate;
  temperatureC: number;
  source: "demo" | "fortyguard";
}

export interface RouteStep {
  instruction: string;
  distanceM: number;
  durationS: number;
}

export interface RouteCandidate {
  id: string;
  name: string;
  coordinates: Coordinate[];
  durationMinutes: number;
  distanceKm: number;
  averageTemperatureC: number;
  maximumTemperatureC: number;
  heatLoad: number;
  hotMinutes: number;
  riskScore: number;
  riskBand: "low" | "guarded" | "high" | "critical";
  temperatureSource: "demo" | "fortyguard";
  steps: RouteStep[];
}

export interface RiderProfile {
  acclimatized: boolean;
  carryingLoadKg: number;
  shiftMinutesCompleted: number;
  hydrationMl: number;
}

export interface RouteAnalysis {
  candidates: RouteCandidate[];
  recommendedRouteId: string;
  generatedAt: string;
  dataMode: "demo" | "live";
}
