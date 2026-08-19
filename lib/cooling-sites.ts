import type { CoolingSite, Coordinate } from "./types";

const SOURCE_URL =
  "https://www.miamidade.gov/initiative/weather-ready/extreme-heat/cooling-sites.page";

// A focused subset of Miami-Dade's official cooling-site directory for the
// Downtown/Brickell launch area. Names, addresses and hours mirror the county
// directory; coordinates place the official addresses on the route map.
export const MIAMI_COOLING_SITES: CoolingSite[] = [
  {
    id: "stephen-p-clark",
    name: "Stephen P. Clark Government Center",
    address: "111 NW 1st Street, Miami, FL 33132",
    hours: "Daily, 6:00 AM–8:00 PM",
    type: "Government building",
    coordinate: [-80.1961, 25.7751],
    sourceUrl: SOURCE_URL,
  },
  {
    id: "main-library",
    name: "Main Library",
    address: "101 West Flagler Street, Miami, FL 33130",
    hours: "Mon–Sat, 9:30 AM–6:00 PM; closed Sunday",
    type: "Public library",
    coordinate: [-80.1965, 25.774],
    sourceUrl: SOURCE_URL,
  },
  {
    id: "camillus-health",
    name: "Camillus Health Concern",
    address: "336 NW 5th Street, Miami, FL 33128",
    hours: "Mon/Fri 7:00 AM–5:00 PM; Tue/Thu 8:00 AM–5:00 PM",
    type: "Health clinic",
    coordinate: [-80.201, 25.779],
    sourceUrl: SOURCE_URL,
  },
  {
    id: "jose-marti-park",
    name: "Jose Marti Park",
    address: "362 SW 4th Street, Miami, FL 33130",
    hours: "Mon–Fri 9:00 AM–9:00 PM; Sat 9:00 AM–4:30 PM",
    type: "City park",
    coordinate: [-80.2025, 25.7695],
    sourceUrl: SOURCE_URL,
  },
];

export function nearestCoolingSites(
  coordinate: Coordinate,
  limit = 2,
): CoolingSite[] {
  return [...MIAMI_COOLING_SITES]
    .sort(
      (a, b) =>
        squaredDistance(a.coordinate, coordinate) -
        squaredDistance(b.coordinate, coordinate),
    )
    .slice(0, limit);
}

function squaredDistance(a: Coordinate, b: Coordinate) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
}
