"use client";

/*
THESIS: HeatMan makes invisible street heat actionable for delivery riders; it
refuses routing that treats the city as one uniform temperature field.
OWN-WORLD: Preserve the cobalt operations workbench, ruled panels, thermal map,
compact measurements, and direct safety language.
STORY: Compare a delivery leg against the heat field, choose the coolest safe
route, then leave with a route and protection plan.
FIRST VIEWPORT: Active delivery setup on the left, New York heat field in the
center, and rider exposure on the right.
FORM: Established-world Operate extension; Rider is the default and Teams
remains available to dispatch.
*/

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  CreateOrganization,
  OrganizationSwitcher,
  SignInButton,
  UserButton,
  useOrganization,
  useUser,
} from "@clerk/nextjs";
import {
  BellRing,
  Bike,
  Bot,
  ChevronRight,
  CircleAlert,
  Clock3,
  Droplets,
  Gauge,
  LayoutDashboard,
  LocateFixed,
  Navigation,
  PersonStanding,
  RefreshCw,
  Route,
  ShieldCheck,
  ThermometerSun,
} from "lucide-react";
import { DispatcherDashboard } from "./DispatcherDashboard";
import { HeatMap } from "./HeatMap";
import {
  createDemoAnalysis,
  createDemoHeatPoints,
  DEFAULT_DESTINATION,
  DEFAULT_ORIGIN,
  DEFAULT_PROFILE,
} from "@/lib/demo-data";
import { nearestCoolingSites } from "@/lib/cooling-sites";
import { extractHeatPoints } from "@/lib/fortyguard";
import {
  buildBreakPlan,
  chooseCoolestSafeRoute,
  scoreRoute,
} from "@/lib/thermal";
import type {
  Coordinate,
  HeatPoint,
  RouteAnalysis,
  RouteCandidate,
  TravelMode,
} from "@/lib/types";

type AgentMessage = {
  id: string;
  role: "agent" | "rider";
  text: string;
  action?: string;
  kind?: "decision" | "selection" | "conversation";
};

type GpsState = "idle" | "requesting" | "active" | "denied" | "error" | "unsupported";

type GpsPosition = {
  coordinate: Coordinate;
  accuracyMeters: number;
  updatedAt: number;
};

const NEW_YORK_ROUTING_BOUNDS = {
  west: -74.2591,
  south: 40.4774,
  east: -73.7004,
  north: 40.9176,
};

const INITIAL_AGENT_MESSAGE: AgentMessage = {
  id: "agent-intro",
  role: "agent",
  text: "The starter view uses a labeled New York simulation. Enter two NYC stops for live routing, then refresh heat to request current FortyGuard tiles.",
  action: "Selected Cool corridor",
  kind: "decision",
};

function explainSafeRoute(
  recommendedRoute: RouteCandidate,
  fastestRoute: RouteCandidate,
  candidates: RouteCandidate[],
  loadReduction: number,
) {
  const allHeatLoadsMatch = candidates.every(
    (route) => Math.abs(route.heatLoad - recommendedRoute.heatLoad) < 0.05,
  );

  if (allHeatLoadsMatch) {
    const tieBreaker =
      recommendedRoute.id === fastestRoute.id
        ? "It has the shortest travel time."
        : "It has the lowest route temperature within the detour limit.";
    return `${recommendedRoute.name} is recommended because all routes have equal modeled heat exposure. ${tieBreaker}`;
  }

  if (recommendedRoute.id === fastestRoute.id) {
    return `${recommendedRoute.name} is recommended because it has the shortest travel time and no alternative provides a lower modeled heat load.`;
  }

  if (loadReduction === 0) {
    return `${recommendedRoute.name} is the coolest safe path within 40% of the fastest travel time. Its modeled heat load matches ${fastestRoute.name}, so HeatMan selects it using the lower route temperature.`;
  }

  return `${recommendedRoute.name} is the coolest safe path within 40% of the fastest travel time. It reduces modeled heat load by ${loadReduction}% compared with ${fastestRoute.name}.`;
}

export function HeatManApp() {
  const [surface, setSurface] = useState<"rider" | "teams">("rider");
  const initialHeat = useMemo(() => createDemoHeatPoints(), []);
  const [baseHeatPoints, setBaseHeatPoints] =
    useState<HeatPoint[]>(initialHeat);
  const [heatPoints, setHeatPoints] = useState<HeatPoint[]>(initialHeat);
  const [forecastHours, setForecastHours] = useState(0);
  const [forecastState, setForecastState] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [forecastFeedback, setForecastFeedback] = useState(
    "Load current FortyGuard heat to unlock +1h and +2h forecasts.",
  );
  const [pickupAddress, setPickupAddress] = useState(
    "Times Square, Manhattan, NY",
  );
  const [dropoffAddress, setDropoffAddress] = useState(
    "Barclays Center, Brooklyn, NY",
  );
  const [gpsState, setGpsState] = useState<GpsState>("idle");
  const [gpsPosition, setGpsPosition] = useState<GpsPosition | null>(null);
  const [gpsPickupCoordinate, setGpsPickupCoordinate] =
    useState<Coordinate | null>(null);
  const [gpsFeedback, setGpsFeedback] = useState(
    "Share your location to use a live New York pickup. Location stays on this device for now.",
  );
  const gpsWatchIdRef = useRef<number | null>(null);
  const pickupBeforeGpsRef = useRef(pickupAddress);
  const originBeforeGpsRef = useRef<Coordinate>(DEFAULT_ORIGIN);
  const [originCoordinate, setOriginCoordinate] =
    useState<Coordinate>(DEFAULT_ORIGIN);
  const [destinationCoordinate, setDestinationCoordinate] =
    useState<Coordinate>(DEFAULT_DESTINATION);
  const [mode, setMode] = useState<TravelMode>("cycling");
  const [analysis, setAnalysis] = useState<RouteAnalysis>(() =>
    createDemoAnalysis("cycling", initialHeat),
  );
  const [selectedRouteId, setSelectedRouteId] = useState(
    analysis.recommendedRouteId,
  );
  const [routeState, setRouteState] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [heatState, setHeatState] = useState<
    "demo" | "loading" | "live" | "forecast" | "error"
  >("demo");
  const [baseHeatMode, setBaseHeatMode] = useState<
    "demo" | "live"
  >("demo");
  const [currentHeatUnavailable, setCurrentHeatUnavailable] = useState(false);
  const [heatLabel, setHeatLabel] = useState("Simulated launch field");
  const [baseHeatLabel, setBaseHeatLabel] = useState("Simulated launch field");
  const [baseHeatDateTime, setBaseHeatDateTime] = useState<{
    date: string;
    time: string;
  } | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([
    INITIAL_AGENT_MESSAGE,
  ]);
  const [agentInput, setAgentInput] = useState("");
  const [crewAlertArmed, setCrewAlertArmed] = useState(false);
  const [plannerError, setPlannerError] = useState("");
  const [plannerStatus, setPlannerStatus] = useState(
    "Enter two New York City stops to compare live route alternatives.",
  );
  const coolingSites = useMemo(
    () => nearestCoolingSites(destinationCoordinate),
    [destinationCoordinate],
  );

  useEffect(() => {
    return () => {
      if (gpsWatchIdRef.current !== null && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      }
    };
  }, []);

  const selectedRoute =
    analysis.candidates.find((route) => route.id === selectedRouteId) ??
    analysis.candidates[0];
  const recommendedRoute =
    analysis.candidates.find(
      (route) => route.id === analysis.recommendedRouteId,
    ) ?? selectedRoute;
  const breakPlan = selectedRoute ? buildBreakPlan(selectedRoute) : [];
  const fastestRoute = [...analysis.candidates].sort(
    (a, b) => a.durationMinutes - b.durationMinutes,
  )[0];
  const timeDelta = selectedRoute && fastestRoute
    ? selectedRoute.durationMinutes - fastestRoute.durationMinutes
    : 0;
  const loadReduction =
    selectedRoute && fastestRoute && fastestRoute.heatLoad > 0
      ? Math.max(
          0,
          Math.round(
            ((fastestRoute.heatLoad - selectedRoute.heatLoad) /
              fastestRoute.heatLoad) *
              100,
          ),
        )
      : 0;

  async function calculateRoutes(nextMode = mode, resolveStops = true) {
    setRouteState("loading");
    setPlannerError("");
    try {
      let nextOrigin = originCoordinate;
      let nextDestination = destinationCoordinate;
      if (resolveStops) {
        setPlannerStatus("Finding both New York City addresses…");
        const [originMatch, destinationMatch] = await Promise.all([
          gpsPickupCoordinate
            ? Promise.resolve({
                label: "Live GPS pickup",
                coordinate: gpsPickupCoordinate,
              })
            : geocodeAddress(pickupAddress),
          geocodeAddress(dropoffAddress),
        ]);
        nextOrigin = originMatch.coordinate;
        nextDestination = destinationMatch.coordinate;
        setOriginCoordinate(nextOrigin);
        setDestinationCoordinate(nextDestination);
        setPlannerStatus(
          `Live address match: ${originMatch.label} → ${destinationMatch.label}`,
        );
      }
      const response = await fetch("/api/routes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          origin: nextOrigin,
          destination: nextDestination,
          mode: nextMode,
        }),
      });
      const payload = await response.json();
      if (!response.ok || payload.error) {
        throw new Error(payload.message ?? "Route alternatives were unavailable.");
      }

      let nextAnalysis: RouteAnalysis;
      if (payload.source === "openrouteservice" && Array.isArray(payload.routes)) {
        const candidates = payload.routes.map(
          (route: {
            id: string;
            name: string;
            coordinates: [number, number][];
            durationSeconds: number;
            distanceMeters: number;
            steps: RouteCandidate["steps"];
          }) => scoreRoute(route, heatPoints, DEFAULT_PROFILE),
        );
        const recommended = chooseCoolestSafeRoute(candidates) ?? candidates[0];
        nextAnalysis = {
          candidates,
          recommendedRouteId: recommended.id,
          generatedAt: new Date().toISOString(),
          dataMode:
            heatState === "live" || heatState === "forecast"
              ? heatState
              : "demo",
        };
      } else {
        throw new Error("Live routing did not return usable alternatives.");
      }

      setAnalysis(nextAnalysis);
      setSelectedRouteId(nextAnalysis.recommendedRouteId);
      setRouteState("success");
      setPlannerStatus(
        `${nextAnalysis.candidates.length} live OpenRouteService alternatives scored against the active heat field.`,
      );
      const recommendation = nextAnalysis.candidates.find(
        (route) => route.id === nextAnalysis.recommendedRouteId,
      );
      if (recommendation) {
        replaceDecisionAgent(
          `Route check complete. ${recommendation.name} is the safest option within the detour limit: ${recommendation.durationMinutes} minutes with a ${recommendation.maximumTemperatureC}°C peak.`,
          `Recommended ${recommendation.name}`,
        );
      }
    } catch (error) {
      setRouteState("error");
      setPlannerError(
        error instanceof Error
          ? error.message
          : "Routes could not be calculated. Try again.",
      );
    }
  }

  async function refreshHeat() {
    setCurrentHeatUnavailable(false);
    setHeatState("loading");
    try {
      const dateTime = previousCompletedHourInNewYork();
      const aoi = createRouteAoi(analysis.candidates);
      const realPoints = await fetchFortyGuardHeat(aoi, dateTime);
      if (!realPoints.length) {
        setHeatPoints(initialHeat);
        setBaseHeatPoints(initialHeat);
        setBaseHeatMode("demo");
        setBaseHeatLabel("Simulated launch field");
        setBaseHeatDateTime(null);
        setHeatLabel(
          `Current FortyGuard field unavailable · ${dateTime.date} ${dateTime.time} New York time`,
        );
        setForecastHours(0);
        setForecastState("idle");
        setForecastFeedback(
          "Current heat is unavailable. Historical data was not loaded automatically.",
        );
        setHeatState("demo");
        setCurrentHeatUnavailable(true);
        rescoreWithHeat(initialHeat, "demo");
        replaceDecisionAgent(
          "Current FortyGuard tiles are unavailable for this New York hour. I restored the clearly labeled simulated starter field.",
          "Retry current New York heat",
        );
        return;
      }
      setHeatPoints(realPoints);
      setBaseHeatPoints(realPoints);
      setBaseHeatMode("live");
      setBaseHeatDateTime(dateTime);
      const nextLabel = `FortyGuard live · ${dateTime.date} ${dateTime.time} New York time`;
      setHeatLabel(nextLabel);
      setBaseHeatLabel(nextLabel);
      setForecastHours(0);
      setForecastState("idle");
      setForecastFeedback("Choose +1h or +2h for a native FortyGuard forecast.");
      const recommended = rescoreWithHeat(realPoints, "live");
      setHeatState("live");
      replaceDecisionAgent(
        `Current FortyGuard tiles are in. I rescored every route and selected ${recommended.name}.`,
        `Recommended ${recommended.name}`,
      );
    } catch (error) {
      setHeatState("error");
      appendAgent(
        error instanceof Error
          ? `${error.message} The active field was not replaced.`
          : "The current heat request failed. The active field was not replaced.",
      );
    }
  }

  function stopGpsTracking(restorePickup = true) {
    if (gpsWatchIdRef.current !== null && "geolocation" in navigator) {
      navigator.geolocation.clearWatch(gpsWatchIdRef.current);
    }
    gpsWatchIdRef.current = null;
    setGpsState("idle");
    setGpsPosition(null);
    setGpsPickupCoordinate(null);
    if (restorePickup) {
      setPickupAddress(pickupBeforeGpsRef.current);
      setOriginCoordinate(originBeforeGpsRef.current);
    }
    setGpsFeedback(
      "Live GPS is off. Your location is no longer being watched by HeatMan.",
    );
  }

  function startGpsTracking() {
    if (!("geolocation" in navigator)) {
      setGpsState("unsupported");
      setGpsFeedback("This browser does not support location sharing.");
      return;
    }

    if (gpsWatchIdRef.current !== null) {
      stopGpsTracking();
      return;
    }

    pickupBeforeGpsRef.current = pickupAddress;
    originBeforeGpsRef.current = originCoordinate;
    setGpsState("requesting");
    setGpsFeedback("Waiting for your browser's location permission…");

    gpsWatchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const coordinate: Coordinate = [
          position.coords.longitude,
          position.coords.latitude,
        ];
        const accuracyMeters = Math.max(1, Math.round(position.coords.accuracy));
        const isInsideNewYork = isWithinNewYorkRoutingArea(coordinate);

        setGpsPosition({
          coordinate,
          accuracyMeters,
          updatedAt: position.timestamp,
        });
        setGpsState("active");

        if (isInsideNewYork) {
          setGpsPickupCoordinate(coordinate);
          setPickupAddress("Live GPS pickup · New York City");
          setOriginCoordinate(coordinate);
          setGpsFeedback(
            `Live GPS connected within ±${accuracyMeters} m and ready as your pickup.`,
          );
          return;
        }

        setGpsPickupCoordinate(null);
        setPickupAddress(pickupBeforeGpsRef.current);
        setOriginCoordinate(originBeforeGpsRef.current);
        setGpsFeedback(
          `GPS connected within ±${accuracyMeters} m, but you are outside HeatMan's current New York live-routing area.`,
        );
      },
      (error) => {
        if (gpsWatchIdRef.current !== null) {
          navigator.geolocation.clearWatch(gpsWatchIdRef.current);
        }
        gpsWatchIdRef.current = null;
        setGpsPickupCoordinate(null);
        setGpsPosition(null);
        setGpsState(error.code === error.PERMISSION_DENIED ? "denied" : "error");
        setGpsFeedback(gpsErrorMessage(error));
      },
      {
        enableHighAccuracy: true,
        maximumAge: 30_000,
        timeout: 15_000,
      },
    );
  }

  function updatePickupAddress(value: string) {
    if (gpsWatchIdRef.current !== null) {
      stopGpsTracking();
    }
    pickupBeforeGpsRef.current = value;
    setPickupAddress(value);
    setGpsPickupCoordinate(null);
  }

  function changeMode(nextMode: TravelMode) {
    setMode(nextMode);
    void calculateRoutes(nextMode, false);
  }

  async function changeForecast(hours: number) {
    if (hours === 0) {
      setForecastHours(0);
      setHeatPoints(baseHeatPoints);
      setHeatState(baseHeatMode);
      setHeatLabel(baseHeatLabel);
      setForecastState("idle");
      setForecastFeedback("Showing the current heat field.");
      const recommended = rescoreWithHeat(baseHeatPoints, baseHeatMode);
      replaceDecisionAgent(
        `Current heat restored. ${recommended.name} is the coolest safe route within the detour limit.`,
        `Recommended ${recommended.name}`,
      );
      return;
    }
    if (baseHeatMode !== "live" || !baseHeatDateTime || currentHeatUnavailable) {
      setForecastState("error");
      setForecastFeedback(
        "Forecast routing needs a current FortyGuard field. Refresh current heat first.",
      );
      return;
    }
    setForecastState("loading");
    setForecastFeedback(`Loading the native FortyGuard +${hours}h New York forecast…`);
    try {
      const targetDateTime = addHoursToLocalDateTime(baseHeatDateTime, hours);
      const aoi = createRouteAoi(analysis.candidates);
      const projected = await fetchFortyGuardHeat(aoi, targetDateTime);
      if (!projected.length) {
        throw new Error(`FortyGuard returned no +${hours}h forecast tiles.`);
      }
      const temperatures = projected.map((point) => point.temperatureC);
      const average =
        temperatures.reduce((total, temperature) => total + temperature, 0) /
        temperatures.length;
      setForecastHours(hours);
      setHeatPoints(projected);
      setHeatState("forecast");
      setForecastState("success");
      setForecastFeedback(
        `FortyGuard +${hours}h loaded: ${average.toFixed(1)}°C average across ${projected.length} tiles.`,
      );
      setHeatLabel(
        `FortyGuard +${hours}h forecast · ${targetDateTime.date} ${targetDateTime.time} New York time`,
      );
      const recommended = rescoreWithHeat(projected, "forecast");
      replaceDecisionAgent(
        `FortyGuard +${hours}h forecast applied. ${recommended.name} is the coolest safe route within the detour limit.`,
        `Recommended ${recommended.name}`,
      );
    } catch (error) {
      setForecastState("error");
      const message =
        error instanceof Error ? error.message : "The forecast could not be loaded.";
      setForecastFeedback(message);
      appendAgent(
        message,
      );
    }
  }

  function rescoreWithHeat(
    projected: HeatPoint[],
    dataMode: RouteAnalysis["dataMode"],
  ) {
    const rescored = analysis.candidates.map((route) =>
      scoreRoute(
        {
          id: route.id,
          name: route.name,
          coordinates: route.coordinates,
          durationSeconds: route.durationMinutes * 60,
          distanceMeters: route.distanceKm * 1000,
          steps: route.steps,
        },
        projected,
        DEFAULT_PROFILE,
      ),
    );
    const recommended = chooseCoolestSafeRoute(rescored) ?? rescored[0];
    setAnalysis((current) => ({
      ...current,
      candidates: rescored,
      recommendedRouteId: recommended.id,
      generatedAt: new Date().toISOString(),
      dataMode,
    }));
    setSelectedRouteId(recommended.id);
    return recommended;
  }

  function submitAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = agentInput.trim();
    if (!query) return;
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "rider", text: query },
    ]);
    setAgentInput("");
    window.setTimeout(() => runAgent(query), 180);
  }

  function runAgent(query: string) {
    const normalized = query.toLowerCase();
    if (normalized.includes("fast")) {
      setSelectedRouteId(fastestRoute.id);
      appendAgent(
        `${fastestRoute.name} is now selected because you requested the fastest path. HeatMan's safety recommendation remains ${recommendedRoute.name}.`,
        `Selected ${fastestRoute.name}`,
        "selection",
      );
      return;
    }
    if (
      normalized.includes("cool") ||
      normalized.includes("safe") ||
      normalized.includes("route")
    ) {
      setSelectedRouteId(recommendedRoute.id);
      appendAgent(
        explainSafeRoute(
          recommendedRoute,
          fastestRoute,
          analysis.candidates,
          loadReduction,
        ),
        `Selected ${recommendedRoute.name}`,
        "selection",
      );
      return;
    }
    if (
      normalized.includes("water") ||
      normalized.includes("hydrate") ||
      normalized.includes("break")
    ) {
      const firstBreak = breakPlan[0];
      appendAgent(
        firstBreak
          ? `Take ${firstBreak.amountMl} mL at minute ${firstBreak.atMinute}. ${firstBreak.instruction}`
          : "This leg is short enough to finish without a scheduled stop. Drink 250 mL before departure and reassess at the drop-off.",
        firstBreak ? "Break added to route" : "Hydration check set",
      );
      return;
    }
    if (
      normalized.includes("alert") ||
      normalized.includes("crew") ||
      normalized.includes("dispatch")
    ) {
      setCrewAlertArmed(true);
      appendAgent(
        "Dispatch heat alerts are armed for this shift. The demo will flag routes at high risk or above 36°C peak exposure.",
        "Shift alert armed",
      );
      return;
    }
    if (normalized.includes("walk")) {
      changeMode("walking");
      appendAgent(
        "I switched to walking and started a fresh thermal route comparison.",
        "Walking mode enabled",
      );
      return;
    }
    appendAgent(
      `Current route: ${selectedRoute.name}, ${selectedRoute.durationMinutes} minutes, ${selectedRoute.averageTemperatureC}°C average, risk ${selectedRoute.riskScore}/100. Ask me for the coolest route, fastest route, a hydration break, or a dispatch alert.`,
    );
  }

  function selectRoute(routeId: string) {
    const route = analysis.candidates.find((candidate) => candidate.id === routeId);
    if (!route) return;
    setSelectedRouteId(route.id);
    appendAgent(
      route.id === recommendedRoute.id
        ? `${route.name} is selected and matches HeatMan's current safety recommendation.`
        : `${route.name} is selected for review. HeatMan's current safety recommendation remains ${recommendedRoute.name}.`,
      `Selected ${route.name}`,
      "selection",
    );
  }

  function replaceDecisionAgent(text: string, action?: string) {
    setMessages((current) => [
      ...current.filter(
        (message) => message.kind !== "decision" && message.kind !== "selection",
      ),
      {
        id: crypto.randomUUID(),
        role: "agent",
        text,
        action,
        kind: "decision",
      },
    ]);
  }

  function appendAgent(
    text: string,
    action?: string,
    kind: AgentMessage["kind"] = "conversation",
  ) {
    setMessages((current) => [
      ...current.filter(
        (message) => kind === "conversation" || message.kind !== kind,
      ),
      { id: crypto.randomUUID(), role: "agent", text, action, kind },
    ]);
  }

  return (
    <div className="heatman-shell">
      <header className="topbar">
        <a
          href={surface === "teams" ? "#command-center" : "#workspace"}
          className="wordmark"
          aria-label="HeatMan home"
        >
          <span className="wordmark__mark" aria-hidden="true">HM</span>
          <span>HeatMan</span>
        </a>
        <nav className="product-switch" aria-label="HeatMan workspace">
          <button
            type="button"
            className={surface === "rider" ? "is-active" : ""}
            aria-pressed={surface === "rider"}
            onClick={() => setSurface("rider")}
          >
            <Bike aria-hidden="true" size={16} />
            Rider
          </button>
          <button
            type="button"
            className={surface === "teams" ? "is-active" : ""}
            aria-pressed={surface === "teams"}
            onClick={() => setSurface("teams")}
          >
            <LayoutDashboard aria-hidden="true" size={16} />
            Teams demo
          </button>
        </nav>
        <div className="topbar__status">
          <AccountControls />
          <span
            className={`source-chip source-chip--${currentHeatUnavailable ? "unavailable" : heatState}`}
            aria-live="polite"
          >
            <span className="source-chip__dot" aria-hidden="true" />
            {currentHeatUnavailable
              ? "CURRENT HEAT UNAVAILABLE"
              : heatState === "live"
                ? "FORTYGUARD LIVE"
                : heatState === "forecast"
                  ? "FORTYGUARD FORECAST"
                  : heatState === "loading"
                    ? "FETCHING HEAT"
                    : heatState === "error"
                      ? "LAST FIELD"
                      : "SIMULATED STARTER"}
          </span>
          <button
            className="icon-action"
            type="button"
            onClick={() => void refreshHeat()}
            disabled={heatState === "loading"}
            aria-label="Refresh FortyGuard heat data"
            data-state={heatState === "loading" ? "loading" : "default"}
          >
            <RefreshCw aria-hidden="true" size={17} />
          </button>
        </div>
      </header>

      {surface === "teams" ? (
        <TeamsWorkspace
          dataMode={heatState}
          onRiderAction={(riderId, action) => {
            if (riderId === "D-204") {
              appendAgent(action, "Dispatch update received");
            }
          }}
        />
      ) : (
        <>
          {currentHeatUnavailable && (
            <aside className="heat-availability-banner" role="status">
              <CircleAlert aria-hidden="true" size={18} />
              <span>
                <strong>Current FortyGuard New York heat is unavailable.</strong>
                The simulated starter field remains clearly labeled while you retry.
              </span>
              <button type="button" onClick={() => void refreshHeat()}>
                Retry live New York heat
              </button>
            </aside>
          )}
          {(selectedRoute.riskBand === "high" ||
            selectedRoute.riskBand === "critical") && (
            <aside className="safety-banner" role="alert">
              <CircleAlert aria-hidden="true" size={18} />
              <span>
                Heat exposure is {selectedRoute.riskBand}. Stop for confusion,
                faintness, or unusual weakness.
              </span>
              <button type="button" onClick={() => setCrewAlertArmed(true)}>
                Alert dispatch
              </button>
            </aside>
          )}

          <main id="workspace" className="workspace">
        <aside className="planner-panel">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">ACTIVE DELIVERY</span>
              <h1>Route the heat, not just the miles.</h1>
            </div>
            <span className="delivery-id">D-204</span>
          </div>

          <div className="mode-switch" aria-label="Travel mode">
            <button
              type="button"
              className={mode === "cycling" ? "is-active" : ""}
              aria-pressed={mode === "cycling"}
              onClick={() => changeMode("cycling")}
            >
              <Bike aria-hidden="true" size={17} />
              Cycle
            </button>
            <button
              type="button"
              className={mode === "walking" ? "is-active" : ""}
              aria-pressed={mode === "walking"}
              onClick={() => changeMode("walking")}
            >
              <PersonStanding aria-hidden="true" size={17} />
              Walk
            </button>
          </div>

          <div className="stop-list">
            <div className="stop-list__rail" aria-hidden="true">
              <span />
              <span />
            </div>
            <label>
              <span>Pickup</span>
              <input
                value={pickupAddress}
                onChange={(event) => updatePickupAddress(event.target.value)}
                aria-label="Pickup address"
                autoComplete="street-address"
              />
            </label>
            <label>
              <span>Drop-off</span>
              <input
                value={dropoffAddress}
                onChange={(event) => setDropoffAddress(event.target.value)}
                aria-label="Drop-off address"
                autoComplete="street-address"
              />
            </label>
          </div>

          <section
            className={`live-gps live-gps--${gpsState}`}
            aria-label="Live rider GPS"
          >
            <button
              type="button"
              className="live-gps__button"
              aria-pressed={gpsState === "active"}
              onClick={startGpsTracking}
              disabled={gpsState === "requesting"}
            >
              {gpsState === "requesting" ? (
                <span className="spinner spinner--gps" aria-hidden="true" />
              ) : (
                <LocateFixed aria-hidden="true" size={17} />
              )}
              {gpsState === "requesting"
                ? "Locating…"
                : gpsState === "active"
                  ? "Stop live GPS"
                  : "Share live GPS"}
            </button>
            <div className="live-gps__status">
              <span aria-hidden="true" />
              <p aria-live="polite">{gpsFeedback}</p>
            </div>
            {gpsPosition ? (
              <p className="live-gps__coordinates">
                {gpsPosition.coordinate[1].toFixed(5)}, {gpsPosition.coordinate[0].toFixed(5)}
                {" · "}updated {new Date(gpsPosition.updatedAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            ) : null}
          </section>

          <button
            className="primary-action"
            type="button"
            onClick={() => void calculateRoutes()}
            disabled={routeState === "loading"}
            data-state={routeState}
          >
            {routeState === "loading" ? (
              <>
                <span className="spinner" aria-hidden="true" />
                Scoring routes
              </>
            ) : routeState === "error" ? (
              <>
                <CircleAlert aria-hidden="true" size={17} />
                Try route check
              </>
            ) : (
              <>
                <Navigation aria-hidden="true" size={17} />
                Compare thermal routes
              </>
            )}
          </button>
          <p
            className={plannerError ? "field-message is-error" : "field-message"}
            aria-live="polite"
          >
            {plannerError ||
              plannerStatus}
          </p>

          <section className="route-list" aria-label="Route alternatives">
            <div className="route-list__heading">
              <h2>Route alternatives</h2>
              <span>{analysis.candidates.length} scored</span>
            </div>
            {analysis.candidates.map((route) => (
              <button
                key={route.id}
                type="button"
                className={
                  route.id === selectedRouteId
                    ? "route-option is-selected"
                    : "route-option"
                }
                onClick={() => selectRoute(route.id)}
                aria-pressed={route.id === selectedRouteId}
              >
                <span className="route-option__main">
                  <span>
                    {route.name}
                    {route.id === analysis.recommendedRouteId && (
                      <small>RECOMMENDED</small>
                    )}
                  </span>
                  <strong>{route.durationMinutes} min</strong>
                </span>
                <span className="route-option__meta">
                  <span>{route.averageTemperatureC}°C avg</span>
                  <span>{route.heatLoad}°C·min load</span>
                  <ChevronRight aria-hidden="true" size={15} />
                </span>
              </button>
            ))}
          </section>
        </aside>

        <HeatMap
          routes={analysis.candidates}
          selectedRouteId={selectedRouteId}
          heatPoints={heatPoints}
          onSelectRoute={selectRoute}
          forecastHours={forecastHours}
          onForecastChange={changeForecast}
          forecastState={forecastState}
          forecastFeedback={forecastFeedback}
          forecastDisabledReason={
            baseHeatMode !== "live" || currentHeatUnavailable
              ? "Load current FortyGuard heat to unlock forecasts."
              : undefined
          }
          coolingSites={coolingSites}
          dataLabel={heatLabel}
        />

        <aside className="risk-panel">
          <section className="risk-score">
            <div className="risk-score__head">
              <span>RIDER RISK</span>
              <span className={`risk-band risk-band--${selectedRoute.riskBand}`}>
                {selectedRoute.riskBand}
              </span>
            </div>
            <div className="risk-score__value">
              <strong>{selectedRoute.riskScore}</strong>
              <span>/100</span>
            </div>
            <div
              className="risk-meter"
              role="meter"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={selectedRoute.riskScore}
              aria-label="Modeled rider heat risk"
            >
              <span style={{ "--risk": selectedRoute.riskScore } as React.CSSProperties} />
            </div>
            <p>
              Modeled from route temperature, time exposed, carried load, shift
              duration, acclimatization, and hydration.
            </p>
          </section>

          <section className="metric-grid" aria-label="Route heat metrics">
            <article>
              <ThermometerSun aria-hidden="true" size={17} />
              <span>Peak</span>
              <strong>{selectedRoute.maximumTemperatureC}°C</strong>
            </article>
            <article>
              <Clock3 aria-hidden="true" size={17} />
              <span>Hot exposure</span>
              <strong>{selectedRoute.hotMinutes} min</strong>
            </article>
            <article>
              <Gauge aria-hidden="true" size={17} />
              <span>Heat load</span>
              <strong>{selectedRoute.heatLoad}°C·min</strong>
            </article>
            <article>
              <Droplets aria-hidden="true" size={17} />
              <span>Water target</span>
              <strong>{breakPlan[0]?.amountMl ?? 250} mL</strong>
            </article>
          </section>

          <section className="impact-strip">
            <ShieldCheck aria-hidden="true" size={20} />
            <div>
              <strong>{loadReduction}% less heat load</strong>
              <span>
                {timeDelta > 0
                  ? `for ${timeDelta.toFixed(1)} extra minutes`
                  : "with no added travel time"}
              </span>
            </div>
          </section>

          <section className="break-plan">
            <div className="section-line">
              <h2>Protection plan</h2>
              <span>{breakPlan.length || 1} action</span>
            </div>
            {breakPlan.length ? (
              breakPlan.map((item) => (
                <article key={`${item.atMinute}-${item.title}`}>
                  <span className="break-plan__time">MIN {item.atMinute}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.instruction}</p>
                    <span>{item.amountMl} mL water</span>
                  </div>
                </article>
              ))
            ) : (
              <article>
                <span className="break-plan__time">START</span>
                <div>
                  <strong>Pre-hydrate</strong>
                  <p>Drink before departure and reassess at the drop-off.</p>
                  <span>250 mL water</span>
                </div>
              </article>
            )}
          </section>

          <button
            className={
              crewAlertArmed ? "alert-toggle is-success" : "alert-toggle"
            }
            type="button"
            onClick={() => setCrewAlertArmed((current) => !current)}
            aria-pressed={crewAlertArmed}
          >
            <BellRing aria-hidden="true" size={17} />
            {crewAlertArmed
              ? "Dispatch alert armed (demo)"
              : "Arm dispatch alert (demo)"}
          </button>
        </aside>
      </main>

      <section className="agent-dock" aria-label="HeatMan agent">
        <div className="agent-dock__identity">
          <span className="agent-avatar" aria-hidden="true">
            <Bot size={18} />
          </span>
          <div>
            <strong>HeatMan decision agent</strong>
            <span>Live tools · deterministic safety rules</span>
          </div>
        </div>
        <div className="agent-thread" aria-live="polite">
          {messages.slice(-2).map((message) => (
            <div
              key={message.id}
              className={`agent-message agent-message--${message.role}`}
            >
              <p>{message.text}</p>
              {message.action && <span>{message.action}</span>}
            </div>
          ))}
        </div>
        <form className="agent-form" onSubmit={submitAgent}>
          <label htmlFor="agent-query">Ask the route agent</label>
          <div>
            <input
              id="agent-query"
              value={agentInput}
              onChange={(event) => setAgentInput(event.target.value)}
              placeholder="e.g. Add a water break"
            />
            <button type="submit" disabled={!agentInput.trim()}>
              <Route aria-hidden="true" size={17} />
              Run
            </button>
          </div>
        </form>
          </section>
        </>
      )}

      <footer className="status-footer">
        <p>
          <span>HeatMan MVP</span>
          <span>
            New York City · {surface === "teams" ? "fleet operations demo" : "rider D-204"}
          </span>
          <span>Thermal score is decision support—not medical advice.</span>
        </p>
      </footer>
    </div>
  );
}

function AccountControls() {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) {
    return null;
  }

  if (!isSignedIn) {
    return (
      <SignInButton mode="modal">
        <button type="button" className="account-action">
          Team sign in
        </button>
      </SignInButton>
    );
  }

  return (
    <div className="account-cluster" aria-label="Company account">
      <OrganizationSwitcher hidePersonal />
      <UserButton />
    </div>
  );
}

function isWithinNewYorkRoutingArea([longitude, latitude]: Coordinate) {
  return (
    longitude >= NEW_YORK_ROUTING_BOUNDS.west &&
    longitude <= NEW_YORK_ROUTING_BOUNDS.east &&
    latitude >= NEW_YORK_ROUTING_BOUNDS.south &&
    latitude <= NEW_YORK_ROUTING_BOUNDS.north
  );
}

function gpsErrorMessage(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) {
    return "Location permission was denied. Allow location access in your browser to use live GPS.";
  }
  if (error.code === error.TIMEOUT) {
    return "HeatMan could not get a GPS fix in time. Move near a window and try again.";
  }
  return "Your current location could not be read. Check that device location is enabled and try again.";
}

async function geocodeAddress(text: string): Promise<{
  label: string;
  coordinate: Coordinate;
}> {
  const response = await fetch("/api/geocode", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const payload = await response.json();
  if (!response.ok || payload.error || !payload.matches?.[0]) {
    throw new Error(payload.message ?? `Could not find “${text}” in New York City.`);
  }
  return payload.matches[0];
}

function TeamsWorkspace({
  dataMode,
  onRiderAction,
}: {
  dataMode: "demo" | "loading" | "live" | "forecast" | "error";
  onRiderAction: (riderId: string, action: string) => void;
}) {
  const { isLoaded: isUserLoaded, isSignedIn } = useUser();
  const { isLoaded: isOrganizationLoaded, organization } = useOrganization();

  if (!isUserLoaded || !isOrganizationLoaded) {
    return (
      <main className="teams-access-gate" aria-busy="true">
        <span className="panel-kicker">COMPANY ACCESS</span>
        <h1>Checking your HeatMan workspace…</h1>
      </main>
    );
  }

  if (!isSignedIn) {
    return (
      <main className="teams-access-gate">
        <span className="panel-kicker">COMPANY ACCESS</span>
        <h1>Sign in to protect your delivery team.</h1>
        <p>
          The Rider workspace stays public. Teams requires a free company
          account so fleet risk and dispatcher actions remain separated.
        </p>
        <SignInButton mode="modal">
          <button type="button" className="auth-primary">
            Sign in or create account
          </button>
        </SignInButton>
      </main>
    );
  }

  if (!organization) {
    return (
      <main className="teams-access-gate teams-access-gate--organization">
        <div className="teams-access-gate__copy">
          <span className="panel-kicker">CREATE YOUR COMPANY</span>
          <h1>Add your delivery organization.</h1>
          <p>
            Your organization keeps riders, dispatchers, alerts, and reports in
            one company workspace. Clerk provides this on its free plan.
          </p>
        </div>
        <CreateOrganization
          routing="hash"
          afterCreateOrganizationUrl="/"
          skipInvitationScreen
        />
      </main>
    );
  }

  return (
    <DispatcherDashboard
      dataMode={dataMode}
      onRiderAction={onRiderAction}
    />
  );
}

function createRouteAoi(routes: RouteCandidate[]) {
  const coordinates = routes.flatMap((route) => route.coordinates);
  const longitudes = coordinates.map(([longitude]) => longitude);
  const latitudes = coordinates.map(([, latitude]) => latitude);
  const padding = 0.0025;
  const minLongitude = Math.min(...longitudes) - padding;
  const maxLongitude = Math.max(...longitudes) + padding;
  const minLatitude = Math.min(...latitudes) - padding;
  const maxLatitude = Math.max(...latitudes) + padding;
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { name: "HeatMan active New York route corridor" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [minLongitude, minLatitude],
              [maxLongitude, minLatitude],
              [maxLongitude, maxLatitude],
              [minLongitude, maxLatitude],
              [minLongitude, minLatitude],
            ],
          ],
        },
      },
    ],
  };
}

async function fetchFortyGuardHeat(
  polygonAoi: ReturnType<typeof createRouteAoi>,
  dateTime: { date: string; time: string },
) {
  const response = await fetch("/api/fortyguard/heatmap", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      polygon_aoi: polygonAoi,
      date_time: {
        start_date: dateTime.date,
        start_time: dateTime.time,
        filter_type: 1,
      },
      granularity: 60,
      analytic_type: "tcm",
    }),
  });
  const responseText = await response.text();
  let payload: {
    error?: boolean;
    message?: string;
    configured?: boolean;
    data?: { activity_id?: string };
  } = {};
  try {
    payload = responseText ? JSON.parse(responseText) : {};
  } catch {
    throw new Error(
      `FortyGuard returned an unreadable response (${response.status}).`,
    );
  }
  if (!response.ok || payload.error) {
    throw new Error(payload.message ?? "The FortyGuard heat request was rejected.");
  }
  if (payload.configured === false) {
    throw new Error("FortyGuard is not configured on this deployment.");
  }
  const activityId = payload?.data?.activity_id;
  if (!activityId) throw new Error("FortyGuard returned no activity ID.");
  const completed = await pollFortyGuard(activityId);
  return extractHeatPoints(
    completed?.data?.result?.map_data ?? completed?.data?.result,
  );
}

async function pollFortyGuard(activityId: string) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const response = await fetch(
      `/api/fortyguard/status/${encodeURIComponent(activityId)}`,
      { cache: "no-store" },
    );
    const payload = await response.json();
    if (!response.ok || payload.error) {
      throw new Error(payload.message ?? "FortyGuard status check failed.");
    }
    const status = String(payload?.data?.status ?? payload?.message ?? "");
    if (status.toLowerCase() === "completed") return payload;
    if (status.toLowerCase() === "failed") {
      throw new Error("FortyGuard could not complete the heatmap activity.");
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error("FortyGuard did not complete within three minutes.");
}

function previousCompletedHourInNewYork(now = new Date()) {
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

function addHoursToLocalDateTime(
  dateTime: { date: string; time: string },
  hours: number,
) {
  const [year, month, day] = dateTime.date.split("-").map(Number);
  const [hour, minute] = dateTime.time.split(":").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day, hour + hours, minute));
  return {
    date: shifted.toISOString().slice(0, 10),
    time: shifted.toISOString().slice(11, 16),
  };
}
