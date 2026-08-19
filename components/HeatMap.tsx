"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { Crosshair, MapPin } from "lucide-react";
import type { CoolingSite, HeatPoint, RouteCandidate } from "@/lib/types";

interface HeatMapProps {
  routes: RouteCandidate[];
  selectedRouteId: string;
  heatPoints: HeatPoint[];
  onSelectRoute: (routeId: string) => void;
  forecastHours: number;
  onForecastChange: (hours: number) => void | Promise<void>;
  forecastState: "idle" | "loading" | "success" | "error";
  forecastFeedback: string;
  coolingSites: CoolingSite[];
  dataLabel: string;
}

export function HeatMap({
  routes,
  selectedRouteId,
  heatPoints,
  onSelectRoute,
  forecastHours,
  onForecastChange,
  forecastState,
  forecastFeedback,
  coolingSites,
  dataLabel,
}: HeatMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const selectRouteRef = useRef(onSelectRoute);
  const [mapReady, setMapReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);

  const routeGeoJson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: routes.map((route) => ({
        type: "Feature" as const,
        properties: {
          id: route.id,
          selected: route.id === selectedRouteId,
          temperature: route.averageTemperatureC,
        },
        geometry: {
          type: "LineString" as const,
          coordinates: route.coordinates,
        },
      })),
    }),
    [routes, selectedRouteId],
  );

  const heatGeoJson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: heatPoints.map((point) => ({
        type: "Feature" as const,
        properties: {
          temperature: point.temperatureC,
          weight: Math.max(0.2, (point.temperatureC - 28) / 10),
        },
        geometry: {
          type: "Point" as const,
          coordinates: point.coordinate,
        },
      })),
    }),
    [heatPoints],
  );
  const coolingGeoJson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: coolingSites.map((site) => ({
        type: "Feature" as const,
        properties: { id: site.id, name: site.name },
        geometry: {
          type: "Point" as const,
          coordinates: site.coordinate,
        },
      })),
    }),
    [coolingSites],
  );
  const initialRouteGeoJson = useRef(routeGeoJson);
  const initialHeatGeoJson = useRef(heatGeoJson);
  const initialCoolingGeoJson = useRef(coolingGeoJson);

  useEffect(() => {
    selectRouteRef.current = onSelectRoute;
  }, [onSelectRoute]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;
    let didLoad = false;

    async function mountMap() {
      try {
        const maplibreModule = await import("maplibre-gl");
        if (cancelled || !containerRef.current) return;
        const maplibre = maplibreModule.default;
        const styles = getComputedStyle(document.documentElement);
        const accent = styles.getPropertyValue("--color-accent").trim();
        const rule = styles.getPropertyValue("--color-muted").trim();
        const cool = styles.getPropertyValue("--color-heat-low").trim();
        const warm = styles.getPropertyValue("--color-heat-warm").trim();
        const hot = styles.getPropertyValue("--color-heat-high").trim();

        const map = new maplibre.Map({
          container: containerRef.current,
          style: "https://tiles.openfreemap.org/styles/liberty",
          center: [-80.192, 25.779],
          zoom: 13.7,
          attributionControl: { compact: true },
        });
        mapRef.current = map;

        map.on("error", () => {
          if (!didLoad && !cancelled) setMapFailed(true);
        });

        map.on("load", () => {
          if (cancelled) return;
          didLoad = true;
          setMapFailed(false);
          map.addSource("heatman-heat", {
            type: "geojson",
            data: initialHeatGeoJson.current,
          });
          map.addLayer({
            id: "heatman-heat",
            type: "heatmap",
            source: "heatman-heat",
            paint: {
              "heatmap-weight": ["get", "weight"],
              "heatmap-intensity": 0.9,
              "heatmap-radius": 30,
              "heatmap-opacity": 0.58,
              "heatmap-color": [
                "interpolate",
                ["linear"],
                ["heatmap-density"],
                0,
                "transparent",
                0.28,
                cool,
                0.58,
                warm,
                1,
                hot,
              ],
            },
          });
          map.addSource("heatman-routes", {
            type: "geojson",
            data: initialRouteGeoJson.current,
          });
          map.addSource("heatman-cooling", {
            type: "geojson",
            data: initialCoolingGeoJson.current,
          });
          map.addLayer({
            id: "heatman-cooling",
            type: "circle",
            source: "heatman-cooling",
            paint: {
              "circle-radius": 7,
              "circle-color": cool,
              "circle-stroke-width": 2,
              "circle-stroke-color": "#ffffff",
            },
          });
          map.addLayer({
            id: "heatman-routes",
            type: "line",
            source: "heatman-routes",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: {
              "line-color": ["case", ["get", "selected"], accent, rule],
              "line-width": ["case", ["get", "selected"], 6, 3],
              "line-opacity": ["case", ["get", "selected"], 1, 0.72],
            },
          });
          map.on("click", "heatman-routes", (event) => {
            const routeId = event.features?.[0]?.properties?.id;
            if (typeof routeId === "string") selectRouteRef.current(routeId);
          });
          map.on("mouseenter", "heatman-routes", () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", "heatman-routes", () => {
            map.getCanvas().style.cursor = "";
          });
          setMapReady(true);
        });
      } catch {
        if (!cancelled) setMapFailed(true);
      }
    }

    void mountMap();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const routesSource = map.getSource("heatman-routes") as
      | GeoJSONSource
      | undefined;
    const heatSource = map.getSource("heatman-heat") as
      | GeoJSONSource
      | undefined;
    const coolingSource = map.getSource("heatman-cooling") as
      | GeoJSONSource
      | undefined;
    routesSource?.setData(routeGeoJson);
    heatSource?.setData(heatGeoJson);
    coolingSource?.setData(coolingGeoJson);

    const selected = routes.find((route) => route.id === selectedRouteId);
    if (selected?.coordinates.length) {
      const longitudes = selected.coordinates.map(([longitude]) => longitude);
      const latitudes = selected.coordinates.map(([, latitude]) => latitude);
      map.fitBounds(
        [
          [Math.min(...longitudes), Math.min(...latitudes)],
          [Math.max(...longitudes), Math.max(...latitudes)],
        ],
        {
          padding: 72,
          duration: 420,
          maxZoom: 15,
        },
      );
    }
  }, [coolingGeoJson, heatGeoJson, mapReady, routeGeoJson, routes, selectedRouteId]);

  return (
    <section className="map-panel" aria-label="Miami thermal route map">
      <div
        ref={containerRef}
        className="maplibre-surface"
        hidden={mapFailed}
        aria-label="Interactive Downtown Miami map"
      />
      {mapFailed && (
        <DemoMap
          routes={routes}
          selectedRouteId={selectedRouteId}
          onSelectRoute={onSelectRoute}
          forecastHours={forecastHours}
        />
      )}

      <div className="map-topline">
        <span className="map-location">
          <Crosshair aria-hidden="true" size={15} />
          Miami route
        </span>
        <span className="map-time">{dataLabel}</span>
      </div>

      <div className="thermal-legend" aria-label="Temperature legend">
        <span>29°C</span>
        <span className="thermal-scale" aria-hidden="true" />
        <span>38°C</span>
      </div>

      <div className="forecast-control" aria-label="Heat forecast horizon">
        {[0, 1, 3].map((hours) => (
          <button
            key={hours}
            type="button"
            className={forecastHours === hours ? "is-active" : ""}
            aria-pressed={forecastHours === hours}
            onClick={() => void onForecastChange(hours)}
            disabled={forecastState === "loading"}
          >
            {hours === 0 ? "Now" : `+${hours}h`}
          </button>
        ))}
        <span
          className={`forecast-feedback forecast-feedback--${forecastState}`}
          role="status"
          aria-live="polite"
        >
          {forecastFeedback}
        </span>
      </div>

      <div className="map-stops" aria-label="Cooling stops">
        {coolingSites.map((stop) => (
          <span key={stop.id}>
            <MapPin aria-hidden="true" size={13} />
            <a href={stop.sourceUrl} target="_blank" rel="noreferrer">
              {stop.name}
            </a>
          </span>
        ))}
      </div>
    </section>
  );
}

function DemoMap({
  routes,
  selectedRouteId,
  onSelectRoute,
  forecastHours,
}: {
  routes: RouteCandidate[];
  selectedRouteId: string;
  onSelectRoute: (routeId: string) => void;
  forecastHours: number;
}) {
  return (
    <div className="demo-map" aria-label="Simulated Downtown Miami heat map">
      <div className="demo-map__water" />
      <div className="demo-map__street street-a">Biscayne Blvd</div>
      <div className="demo-map__street street-b">NE 2nd Ave</div>
      <div className="demo-map__street street-c">Flagler St</div>
      <div className="demo-map__street street-d">Miami Ave</div>
      <div className="heat-pocket heat-pocket--one">36.8°</div>
      <div className="heat-pocket heat-pocket--two">34.9°</div>
      <div className="heat-pocket heat-pocket--three">31.2°</div>
      <svg
        className="demo-routes"
        viewBox="0 0 900 640"
        role="img"
        aria-label="Three thermal-scored route alternatives"
      >
        {routes.map((route, index) => {
          const paths = [
            "M 160 520 C 260 470, 310 380, 410 320 S 610 220, 760 120",
            "M 160 520 C 300 430, 370 360, 490 270 S 650 190, 760 120",
            "M 160 520 C 110 390, 210 260, 360 210 S 600 170, 760 120",
          ];
          return (
            <path
              key={route.id}
              className={
                route.id === selectedRouteId
                  ? "demo-route is-selected"
                  : "demo-route"
              }
              d={paths[index] ?? paths[0]}
              tabIndex={0}
              onClick={() => onSelectRoute(route.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  onSelectRoute(route.id);
                }
              }}
            >
              <title>
                {route.name}: {route.averageTemperatureC}°C average
              </title>
            </path>
          );
        })}
        <circle className="route-stop" cx="160" cy="520" r="8" />
        <circle className="route-stop route-stop--finish" cx="760" cy="120" r="9" />
      </svg>
      <span className="demo-map__label demo-map__label--start">Pickup</span>
      <span className="demo-map__label demo-map__label--finish">Drop-off</span>
      <span className="demo-badge">
        {forecastHours
          ? `SIMULATED +${forecastHours}H HEAT MODEL`
          : "SIMULATED HEAT FIELD"}
      </span>
    </div>
  );
}
