"use client";

/*
THESIS: HeatMan makes invisible street heat actionable for delivery riders; it
refuses routing that treats the city as one uniform temperature field.
OWN-WORLD: Preserve the cobalt operations workbench, ruled panels, thermal map,
compact measurements, and direct safety language.
STORY: Compare a delivery leg against the heat field, choose the coolest safe
route, then leave with a route and protection plan.
FIRST VIEWPORT: Active delivery setup on the left, Miami heat field in the
center, and rider exposure on the right.
FORM: Established-world Operate extension; Rider is the default and Teams
remains available to dispatch.
*/

import { FormEvent, useMemo, useState } from "react";
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
  shiftHeatPoints,
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
};

const INITIAL_AGENT_MESSAGE: AgentMessage = {
  id: "agent-intro",
  role: "agent",
  text: "The starter view uses a labeled simulated field. Enter two Miami stops for live routing, then refresh heat to request FortyGuard tiles.",
  action: "Selected Cool corridor",
};

export function HeatManApp() {
  const [surface, setSurface] = useState<"rider" | "teams">("rider");
  const initialHeat = useMemo(() => createDemoHeatPoints(), []);
  const [baseHeatPoints, setBaseHeatPoints] =
    useState<HeatPoint[]>(initialHeat);
  const [heatPoints, setHeatPoints] = useState<HeatPoint[]>(initialHeat);
  const [forecastHours, setForecastHours] = useState(0);
  const [pickupAddress, setPickupAddress] = useState(
    "Brickell City Centre, Miami, FL",
  );
  const [dropoffAddress, setDropoffAddress] = useState(
    "Adrienne Arsht Center, Miami, FL",
  );
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
    "demo" | "loading" | "live" | "verified" | "forecast" | "error"
  >("demo");
  const [baseHeatMode, setBaseHeatMode] = useState<
    "demo" | "live" | "verified"
  >("demo");
  const [heatLabel, setHeatLabel] = useState("Simulated launch field");
  const [baseHeatLabel, setBaseHeatLabel] = useState("Simulated launch field");
  const [messages, setMessages] = useState<AgentMessage[]>([
    INITIAL_AGENT_MESSAGE,
  ]);
  const [agentInput, setAgentInput] = useState("");
  const [crewAlertArmed, setCrewAlertArmed] = useState(false);
  const [plannerError, setPlannerError] = useState("");
  const [plannerStatus, setPlannerStatus] = useState(
    "Enter two Miami stops to compare live route alternatives.",
  );
  const coolingSites = useMemo(
    () => nearestCoolingSites(destinationCoordinate),
    [destinationCoordinate],
  );

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
        setPlannerStatus("Finding both Miami addresses…");
        const [originMatch, destinationMatch] = await Promise.all([
          geocodeAddress(pickupAddress),
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
            heatState === "live" || heatState === "verified" || heatState === "forecast"
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
        appendAgent(
          `Route check complete. ${recommendation.name} is the safest option within the detour limit: ${recommendation.durationMinutes} minutes with a ${recommendation.maximumTemperatureC}°C peak.`,
          `Selected ${recommendation.name}`,
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
    setHeatState("loading");
    try {
      const dateTime = previousCompletedHourInMiami();
      const aoi = createRouteAoi(analysis.candidates);
      let realPoints = await fetchFortyGuardHeat(aoi, dateTime);
      let nextMode: "live" | "verified" = "live";
      let nextLabel = `FortyGuard ${dateTime.date} ${dateTime.time} Miami time`;
      if (!realPoints.length) {
        realPoints = await fetchFortyGuardHeat(aoi, {
          date: "2025-08-20",
          time: "13:00",
        });
        nextMode = "verified";
        nextLabel = "FortyGuard verified event · Aug 20, 2025 1:00 PM";
      }
      if (!realPoints.length) throw new Error("FortyGuard returned no route-area tiles.");
      setHeatPoints(realPoints);
      setBaseHeatPoints(realPoints);
      setBaseHeatMode(nextMode);
      setHeatLabel(nextLabel);
      setBaseHeatLabel(nextLabel);
      setForecastHours(0);
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
          realPoints,
          DEFAULT_PROFILE,
        ),
      );
      const recommended = chooseCoolestSafeRoute(rescored) ?? rescored[0];
      setAnalysis({
        candidates: rescored,
        recommendedRouteId: recommended.id,
        generatedAt: new Date().toISOString(),
        dataMode: nextMode,
      });
      setSelectedRouteId(recommended.id);
      setHeatState(nextMode);
      appendAgent(
        nextMode === "live"
          ? `Current FortyGuard tiles are in. I rescored every route and selected ${recommended.name}.`
          : `Current tiles were unavailable, so I used a real FortyGuard Miami heat-event field from August 20, 2025 and selected ${recommended.name}.`,
        nextMode === "live" ? "Live thermal route applied" : "Verified event field applied",
      );
    } catch (error) {
      setHeatState("error");
      appendAgent(
        error instanceof Error
          ? `${error.message} The last verified heat field remains on the map.`
          : "The heat field could not be refreshed. The last verified field remains active.",
      );
    }
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
      rescoreWithHeat(baseHeatPoints, baseHeatMode);
      return;
    }
    setHeatState("loading");
    const midpoint = selectedRoute.coordinates[
      Math.floor(selectedRoute.coordinates.length / 2)
    ] ?? destinationCoordinate;
    try {
      const response = await fetch(
        `/api/forecast?lat=${midpoint[1]}&lon=${midpoint[0]}&hours=${hours}`,
        { cache: "no-store" },
      );
      const payload = await response.json();
      if (!response.ok || payload.error) {
        throw new Error(payload.message ?? "The forecast is unavailable.");
      }
      const projected = shiftHeatPoints(baseHeatPoints, Number(payload.deltaC));
      setForecastHours(hours);
      setHeatPoints(projected);
      setHeatState("forecast");
      setHeatLabel(
        `Open-Meteo +${hours}h · ${payload.temperatureC}°C air · ${payload.relativeHumidity}% RH · ${baseHeatMode === "demo" ? "simulated spatial baseline" : "FortyGuard spatial baseline"}`,
      );
      rescoreWithHeat(projected, "forecast");
    } catch (error) {
      setHeatState(baseHeatMode);
      setHeatLabel(baseHeatLabel);
      appendAgent(
        error instanceof Error ? error.message : "The forecast could not be loaded.",
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
        `${fastestRoute.name} saves ${Math.max(0, timeDelta).toFixed(1)} minutes, but its heat load is ${fastestRoute.heatLoad}°C·min. I selected it—watch the exposure panel before starting.`,
        `Selected ${fastestRoute.name}`,
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
        `${recommendedRoute.name} is the coolest safe path within 40% of the fastest travel time. It reduces modeled heat load by ${loadReduction}% versus the fastest alternative.`,
        `Selected ${recommendedRoute.name}`,
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

  function appendAgent(text: string, action?: string) {
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "agent", text, action },
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
          <span
            className={`source-chip source-chip--${heatState}`}
            aria-live="polite"
          >
            <span className="source-chip__dot" aria-hidden="true" />
            {heatState === "live"
              ? "FORTYGUARD LIVE"
              : heatState === "verified"
                ? "FORTYGUARD VERIFIED"
                : heatState === "forecast"
                  ? "OPEN-METEO FORECAST"
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
        <DispatcherDashboard
          dataMode={heatState}
          onRiderAction={(riderId, action) => {
            if (riderId === "D-204") {
              appendAgent(action, "Dispatch update received");
            }
          }}
        />
      ) : (
        <>
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
                onChange={(event) => setPickupAddress(event.target.value)}
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
                onClick={() => setSelectedRouteId(route.id)}
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
          onSelectRoute={setSelectedRouteId}
          forecastHours={forecastHours}
          onForecastChange={changeForecast}
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
            Miami · {surface === "teams" ? "fleet operations demo" : "rider D-204"}
          </span>
          <span>Thermal score is decision support—not medical advice.</span>
        </p>
      </footer>
    </div>
  );
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
    throw new Error(payload.message ?? `Could not find “${text}” in Miami.`);
  }
  return payload.matches[0];
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
        properties: { name: "HeatMan active Miami route corridor" },
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
  const payload = await response.json();
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
