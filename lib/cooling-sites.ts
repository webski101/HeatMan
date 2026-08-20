import type { CoolingSite, Coordinate } from "./types";

// Public, air-conditioned library options along the Midtown Manhattan to
// Downtown Brooklyn launch corridor. Opening hours can change, so riders are
// sent to each library's official page before relying on a stop.
export const NYC_COOLING_SITES: CoolingSite[] = [
  {
    id: "snfl",
    name: "Stavros Niarchos Foundation Library",
    address: "455 Fifth Avenue, New York, NY 10016",
    hours: "Check official page for today's hours",
    type: "Public library · indoor cooling option",
    coordinate: [-73.9816, 40.7519],
    sourceUrl: "https://www.nypl.org/locations/snfl/",
  },
  {
    id: "new-amsterdam-library",
    name: "New Amsterdam Library",
    address: "9 Murray Street, New York, NY 10007",
    hours: "Check official page for today's hours",
    type: "Public library · indoor cooling option",
    coordinate: [-74.0087, 40.7134],
    sourceUrl: "https://www.nypl.org/locations/new-amsterdam",
  },
  {
    id: "pacific-library",
    name: "Pacific Library",
    address: "25 Fourth Avenue, Brooklyn, NY 11217",
    hours: "Check official page for today's hours",
    type: "Public library · indoor cooling option",
    coordinate: [-73.9784, 40.6862],
    sourceUrl: "https://www.bklynlibrary.org/locations/pacific",
  },
  {
    id: "brooklyn-central-library",
    name: "Brooklyn Public Library — Central",
    address: "10 Grand Army Plaza, Brooklyn, NY 11238",
    hours: "Check official page for today's hours",
    type: "Public library · indoor cooling option",
    coordinate: [-73.9708, 40.6725],
    sourceUrl: "https://www.bklynlibrary.org/locations/central",
  },
];

export function nearestCoolingSites(
  coordinate: Coordinate,
  limit = 2,
): CoolingSite[] {
  return [...NYC_COOLING_SITES]
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
