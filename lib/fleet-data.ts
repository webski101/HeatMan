export type FleetRiskBand = "low" | "guarded" | "high" | "critical";

export type FleetRider = {
  id: string;
  name: string;
  initials: string;
  vehicle: "Bike" | "E-bike" | "Walk";
  zone: string;
  nextStop: string;
  riskScore: number;
  riskBand: FleetRiskBand;
  temperatureC: number;
  hotMinutes: number;
  shift: string;
  eta: string;
  position: { x: number; y: number };
  status: string;
  alertState: "none" | "open" | "delivered" | "acknowledged";
  lastIntervention: string;
};

export const INITIAL_FLEET: FleetRider[] = [
  {
    id: "D-091",
    name: "Luis R.",
    initials: "LR",
    vehicle: "E-bike",
    zone: "Midtown",
    nextStop: "Broadway",
    riskScore: 91,
    riskBand: "critical",
    temperatureC: 38.1,
    hotMinutes: 42,
    shift: "11:00–17:00",
    eta: "8 min",
    position: { x: 34, y: 23 },
    status: "Break overdue",
    alertState: "open",
    lastIntervention: "Automatic alert · 13:42",
  },
  {
    id: "D-204",
    name: "Maya T.",
    initials: "MT",
    vehicle: "Bike",
    zone: "Lower Manhattan",
    nextStop: "Canal St",
    riskScore: 82,
    riskBand: "high",
    temperatureC: 37.2,
    hotMinutes: 31,
    shift: "12:00–18:00",
    eta: "12 min",
    position: { x: 53, y: 45 },
    status: "Exposed arterial",
    alertState: "delivered",
    lastIntervention: "Cool-route notice · 13:39",
  },
  {
    id: "D-175",
    name: "Mateo S.",
    initials: "MS",
    vehicle: "Bike",
    zone: "Downtown Brooklyn",
    nextStop: "Atlantic Ave",
    riskScore: 64,
    riskBand: "guarded",
    temperatureC: 35.6,
    hotMinutes: 23,
    shift: "10:30–16:30",
    eta: "6 min",
    position: { x: 48, y: 69 },
    status: "Hydration due",
    alertState: "none",
    lastIntervention: "Hydration reminder · 13:31",
  },
  {
    id: "D-118",
    name: "Andre K.",
    initials: "AK",
    vehicle: "E-bike",
    zone: "Williamsburg",
    nextStop: "Bedford Ave",
    riskScore: 58,
    riskBand: "guarded",
    temperatureC: 34.9,
    hotMinutes: 18,
    shift: "09:00–15:00",
    eta: "15 min",
    position: { x: 69, y: 29 },
    status: "On cooler route",
    alertState: "acknowledged",
    lastIntervention: "Route accepted · 13:27",
  },
  {
    id: "D-226",
    name: "Nia B.",
    initials: "NB",
    vehicle: "Walk",
    zone: "Civic Center",
    nextStop: "Chambers St",
    riskScore: 31,
    riskBand: "low",
    temperatureC: 31.4,
    hotMinutes: 7,
    shift: "13:00–17:00",
    eta: "4 min",
    position: { x: 27, y: 52 },
    status: "Near cooling point",
    alertState: "none",
    lastIntervention: "No intervention",
  },
  {
    id: "D-243",
    name: "Camila V.",
    initials: "CV",
    vehicle: "Bike",
    zone: "Prospect Heights",
    nextStop: "Flatbush Ave",
    riskScore: 26,
    riskBand: "low",
    temperatureC: 30.9,
    hotMinutes: 5,
    shift: "08:00–14:00",
    eta: "10 min",
    position: { x: 79, y: 55 },
    status: "Park shade corridor",
    alertState: "none",
    lastIntervention: "No intervention",
  },
];

export function riskBandForScore(score: number): FleetRiskBand {
  if (score >= 86) return "critical";
  if (score >= 70) return "high";
  if (score >= 45) return "guarded";
  return "low";
}
