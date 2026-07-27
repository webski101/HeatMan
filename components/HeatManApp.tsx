"use client";

/*
THESIS: HeatMan starts with a normal outdoor trip and makes invisible street
heat actionable; it refuses weather-app city averages.
OWN-WORLD: Preserve the cobalt operations workbench, ruled panels, thermal map,
compact measurements, and direct safety language.
STORY: Choose how you travel, set heat sensitivity, compare routes and departure
times, then leave with a route and protection plan.
FIRST VIEWPORT: Personal trip setup on the left, Miami heat field in the center,
and the user's exposure result on the right.
FORM: Established-world Operate extension; Personal is the default and Teams
remains one switch away.
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
} from "@/lib/demo-data";
import { extractHeatPoints } from "@/lib/fortyguard";
import {
  buildBreakPlan,
  chooseCoolestSafeRoute,
  projectHeatPoints,
  scoreRoute,
} from "@/lib/thermal";
import type {
  Coordinate,
  HeatPoint,
  RiderProfile,
  RouteAnalysis,
  RouteCandidate,
  TravelMode,
} from "@/lib/types";

type AgentMessage = {
  id: string;
  role: "agent" | "user";
  text: string;
  action?: string;
};

type PersonalProfileMode = "everyday" | "heat-sensitive";
type GeocodeResult =
  | { configured: false }
  | { configured: true; coordinate: Coordinate };

const DEFAULT_ORIGIN_LABEL = "Brickell · current location";
const DEFAULT_DESTINATION_LABEL = "Museum Park";

const INITIAL_AGENT_MESSAGE: AgentMessage = {
  id: "agent-intro",
  role: "agent",
  text: "I compared three ways to reach Museum Park against the current street-level heat. The cool corridor lowers your exposure without a major delay.",
  action: "Selected Cool corridor",
};

export function HeatManApp() {
  const [surface, setSurface] = useState<"personal" | "teams">("personal");
  const initialHeat = useMemo(() => createDemoHeatPoints(), []);
  const [baseHeatPoints, setBaseHeatPoints] =
    useState<HeatPoint[]>(initialHeat);
  const [heatPoints, setHeatPoints] = useState<HeatPoint[]>(initialHeat);
  const [forecastHours, setForecastHours] = useState(0);
  const [mode, setMode] = useState<TravelMode>("walking");
  const [personalProfile, setPersonalProfile] =
    useState<PersonalProfileMode>("everyday");
  const [analysis, setAnalysis] = useState<RouteAnalysis>(() =>
    createDemoAnalysis("walking", initialHeat),
  );
  const [selectedRouteId, setSelectedRouteId] = useState(
    analysis.recommendedRouteId,
  );
  const [routeState, setRouteState] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [heatState, setHeatState] = useState<
    "demo" | "loading" | "live" | "error"
  >("demo");
  const [messages, setMessages] = useState<AgentMessage[]>([
    INITIAL_AGENT_MESSAGE,
  ]);
  const [agentInput, setAgentInput] = useState("");
  const [tripAlertArmed, setTripAlertArmed] = useState(false);
  const [plannerError, setPlannerError] = useState("");
  const [plannerNotice, setPlannerNotice] = useState("");
  const [originText, setOriginText] = useState(DEFAULT_ORIGIN_LABEL);
  const [destinationText, setDestinationText] = useState(
    DEFAULT_DESTINATION_LABEL,
  );
  const [tripOrigin, setTripOrigin] = useState<Coordinate>(DEFAULT_ORIGIN);
  const [tripDestination, setTripDestination] =
    useState<Coordinate>(DEFAULT_DESTINATION);
  const activeProfile = personalProfileFor(personalProfile);

  const selectedRoute =
    analysis.candidates.find((route) => route.id === selectedRouteId) ??
    analysis.candidates[0];
  const tripAlertMessage = !tripAlertArmed
    ? ""
    : selectedRoute.riskBand === "high" ||
        selectedRoute.riskBand === "critical" ||
        selectedRoute.maximumTemperatureC >= 36
      ? `Heat alert: this trip is ${selectedRoute.riskBand} risk with a ${selectedRoute.maximumTemperatureC}°C peak. Use the protection plan before leaving.`
      : "Monitoring this trip. I’ll alert you if risk becomes high or the route peaks above 36°C.";
  const recommendedRoute =
    analysis.candidates.find(
      (route) => route.id === analysis.recommendedRouteId,
    ) ?? selectedRoute;
  const breakPlan = selectedRoute ? buildBreakPlan(selectedRoute) : [];
  const departureOptions = useMemo(
    () =>
      buildDepartureOptions(
        analysis.candidates,
        baseHeatPoints,
        personalProfileFor(personalProfile),
      ),
    [analysis.candidates, baseHeatPoints, personalProfile],
  );
  const bestDeparture =
    [...departureOptions].sort(
      (a, b) =>
        a.riskScore - b.riskScore ||
        a.maximumTemperatureC - b.maximumTemperatureC,
    )[0] ?? departureOptions[0];
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

  async function calculateRoutes(
    nextMode = mode,
    nextProfile = activeProfile,
  ) {
    setRouteState("loading");
    setPlannerError("");
    setPlannerNotice("");
    try {
      let nextOrigin = tripOrigin;
      let nextDestination = tripDestination;
      const customOrigin = originText.trim() !== DEFAULT_ORIGIN_LABEL;
      const customDestination =
        destinationText.trim() !== DEFAULT_DESTINATION_LABEL;

      if (customOrigin || customDestination) {
        const [resolvedOrigin, resolvedDestination] = await Promise.all([
          customOrigin
            ? geocodeLocation(originText)
            : Promise.resolve<GeocodeResult>({
                configured: true,
                coordinate: tripOrigin,
              }),
          customDestination
            ? geocodeLocation(destinationText)
            : Promise.resolve<GeocodeResult>({
                configured: true,
                coordinate: tripDestination,
              }),
        ]);
        if (!resolvedOrigin.configured || !resolvedDestination.configured) {
          setPlannerNotice(
            "Live address search needs Mapbox. Showing the labeled Miami sample route for now.",
          );
        } else {
          nextOrigin = resolvedOrigin.coordinate;
          nextDestination = resolvedDestination.coordinate;
          setTripOrigin(nextOrigin);
          setTripDestination(nextDestination);
        }
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
      if (payload.source === "mapbox" && Array.isArray(payload.routes)) {
        const candidates = payload.routes.map(
          (route: {
            id: string;
            name: string;
            coordinates: [number, number][];
            durationSeconds: number;
            distanceMeters: number;
            steps: RouteCandidate["steps"];
          }) => scoreRoute(route, heatPoints, nextProfile),
        );
        const recommended = chooseCoolestSafeRoute(candidates) ?? candidates[0];
        nextAnalysis = {
          candidates,
          recommendedRouteId: recommended.id,
          generatedAt: new Date().toISOString(),
          dataMode: heatState === "live" ? "live" : "demo",
        };
      } else {
        nextAnalysis = createDemoAnalysis(nextMode, heatPoints, nextProfile);
      }

      setAnalysis(nextAnalysis);
      setSelectedRouteId(nextAnalysis.recommendedRouteId);
      setRouteState("success");
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
      const response = await fetch("/api/fortyguard/heatmap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          polygon_aoi: {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: { name: "HeatMan Downtown Miami AOI" },
                geometry: {
                  type: "Polygon",
                  coordinates: [
                    [
                      [-80.201, 25.765],
                      [-80.1805, 25.765],
                      [-80.1805, 25.794],
                      [-80.201, 25.794],
                      [-80.201, 25.765],
                    ],
                  ],
                },
              },
            ],
          },
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
        throw new Error(
          payload.message ?? "The FortyGuard heat request was rejected.",
        );
      }
      if (payload.configured === false) {
        setHeatState("demo");
        appendAgent(
          "FortyGuard credentials are not connected on this deployment. I kept the Miami simulation active and clearly labeled.",
        );
        return;
      }

      const activityId = payload?.data?.activity_id;
      if (!activityId) {
        throw new Error("FortyGuard returned no activity ID.");
      }
      const completed = await pollFortyGuard(activityId);
      const livePoints = extractHeatPoints(
        completed?.data?.result?.map_data ?? completed?.data?.result,
      );
      if (!livePoints.length) {
        throw new Error(
          "FortyGuard completed the request but returned no readable temperature tiles.",
        );
      }
      setHeatPoints(livePoints);
      setBaseHeatPoints(livePoints);
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
          livePoints,
          activeProfile,
        ),
      );
      const recommended = chooseCoolestSafeRoute(rescored) ?? rescored[0];
      setAnalysis({
        candidates: rescored,
        recommendedRouteId: recommended.id,
        generatedAt: new Date().toISOString(),
        dataMode: "live",
      });
      setSelectedRouteId(recommended.id);
      setHeatState("live");
      appendAgent(
        `FortyGuard live tiles are in. I rescored every route and selected ${recommended.name}.`,
        "Live thermal route applied",
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
    void calculateRoutes(nextMode);
  }

  function changePersonalProfile(nextProfile: PersonalProfileMode) {
    setPersonalProfile(nextProfile);
    const profile = personalProfileFor(nextProfile);
    const rescored = rescoreCandidates(analysis.candidates, heatPoints, profile);
    const recommended = chooseCoolestSafeRoute(rescored) ?? rescored[0];
    setAnalysis((current) => ({
      ...current,
      candidates: rescored,
      recommendedRouteId: recommended.id,
      generatedAt: new Date().toISOString(),
    }));
    setSelectedRouteId(recommended.id);
    appendAgent(
      nextProfile === "heat-sensitive"
        ? "I made the risk model more cautious and rescored every route for higher heat sensitivity."
        : "I returned to the standard everyday-trip profile and rescored every route.",
      nextProfile === "heat-sensitive"
        ? "Heat-sensitive profile on"
        : "Everyday profile on",
    );
  }

  function changeForecast(hours: number) {
    const projected = projectHeatPoints(baseHeatPoints, hours);
    setForecastHours(hours);
    setHeatPoints(projected);
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
        activeProfile,
      ),
    );
    const recommended = chooseCoolestSafeRoute(rescored) ?? rescored[0];
    setAnalysis((current) => ({
      ...current,
      candidates: rescored,
      recommendedRouteId: recommended.id,
      generatedAt: new Date().toISOString(),
    }));
    setSelectedRouteId(recommended.id);
  }

  function submitAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = agentInput.trim();
    if (!query) return;
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", text: query },
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
      normalized.includes("notify") ||
      normalized.includes("check")
    ) {
      setTripAlertArmed(true);
      appendAgent(
        "Trip heat alerts are on. I will flag a high-risk route or a peak above 36°C in this demonstration.",
        "Trip alerts on",
      );
      return;
    }
    if (
      normalized.includes("later") ||
      normalized.includes("hour") ||
      normalized.includes("time")
    ) {
      const hours = normalized.includes("3") ? 3 : 1;
      changeForecast(hours);
      appendAgent(
        `I projected the street-level heat ${hours} hour${hours === 1 ? "" : "s"} from now and rescored every route.`,
        `Showing +${hours}h forecast`,
      );
      return;
    }
    if (normalized.includes("sensitive")) {
      changePersonalProfile("heat-sensitive");
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
      `Current route: ${selectedRoute.name}, ${selectedRoute.durationMinutes} minutes, ${selectedRoute.averageTemperatureC}°C average, risk ${selectedRoute.riskScore}/100. Ask for the coolest route, fastest route, a hydration break, or whether leaving later is safer.`,
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
            className={surface === "personal" ? "is-active" : ""}
            aria-pressed={surface === "personal"}
            onClick={() => setSurface("personal")}
          >
            <PersonStanding aria-hidden="true" size={16} />
            Personal
          </button>
          <button
            type="button"
            className={surface === "teams" ? "is-active" : ""}
            aria-pressed={surface === "teams"}
            onClick={() => setSurface("teams")}
          >
            <LayoutDashboard aria-hidden="true" size={16} />
            Teams
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
              : heatState === "loading"
                ? "FETCHING HEAT"
                : heatState === "error"
                  ? "LAST FIELD"
                  : "MIAMI SIMULATION"}
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
        <DispatcherDashboard dataMode={heatState} />
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
              <button type="button" onClick={() => setTripAlertArmed(true)}>
                Turn on trip alerts
              </button>
            </aside>
          )}

          <main id="workspace" className="workspace">
        <aside className="planner-panel">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">PERSONAL TRIP · MIAMI</span>
              <h1>Plan around the heat.</h1>
            </div>
            <span className="delivery-id">OUTDOORS</span>
          </div>

          <div className="mode-switch" aria-label="Travel mode">
            <button
              type="button"
              className={mode === "walking" ? "is-active" : ""}
              aria-pressed={mode === "walking"}
              onClick={() => changeMode("walking")}
            >
              <PersonStanding aria-hidden="true" size={17} />
              Walk
            </button>
            <button
              type="button"
              className={mode === "cycling" ? "is-active" : ""}
              aria-pressed={mode === "cycling"}
              onClick={() => changeMode("cycling")}
            >
              <Bike aria-hidden="true" size={17} />
              Cycle
            </button>
          </div>

          <section className="personal-profile" aria-labelledby="personal-profile-title">
            <div className="section-line">
              <h2 id="personal-profile-title">Plan for me</h2>
              <span>changes risk score</span>
            </div>
            <div className="profile-choice">
              <button
                type="button"
                className={personalProfile === "everyday" ? "is-active" : ""}
                aria-pressed={personalProfile === "everyday"}
                onClick={() => changePersonalProfile("everyday")}
              >
                <strong>Everyday</strong>
                <span>Standard heat caution</span>
              </button>
              <button
                type="button"
                className={
                  personalProfile === "heat-sensitive" ? "is-active" : ""
                }
                aria-pressed={personalProfile === "heat-sensitive"}
                onClick={() => changePersonalProfile("heat-sensitive")}
              >
                <strong>Heat-sensitive</strong>
                <span>More cautious guidance</span>
              </button>
            </div>
          </section>

          <div className="stop-list">
            <div className="stop-list__rail" aria-hidden="true">
              <span />
              <span />
            </div>
            <label>
              <span>Starting from</span>
              <input
                value={originText}
                onChange={(event) => setOriginText(event.target.value)}
                aria-label="Starting location"
              />
            </label>
            <label>
              <span>Going to</span>
              <input
                value={destinationText}
                onChange={(event) => setDestinationText(event.target.value)}
                aria-label="Destination"
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
                Find my coolest route
              </>
            )}
          </button>
          <p
            className={plannerError ? "field-message is-error" : "field-message"}
            aria-live="polite"
          >
            {plannerError ||
              plannerNotice ||
              "Routes are scored by travel time and cumulative heat exposure."}
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
        />

        <aside className="risk-panel">
          <section className="risk-score">
            <div className="risk-score__head">
              <span>YOUR TRIP RISK</span>
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
              aria-label="Modeled personal trip heat risk"
            >
              <span style={{ "--risk": selectedRoute.riskScore } as React.CSSProperties} />
            </div>
            <p>
              Modeled from street temperature, time outside, route exposure,
              hydration, and your selected heat-sensitivity profile.
            </p>
          </section>

          <section
            className="departure-comparison"
            aria-labelledby="departure-title"
          >
            <div className="section-line">
              <h2 id="departure-title">Best time to leave</h2>
              <span>
                {bestDeparture?.hours === 0
                  ? "now"
                  : `in ${bestDeparture?.hours}h`}
              </span>
            </div>
            <div className="departure-options">
              {departureOptions.map((option) => (
                <button
                  key={option.hours}
                  type="button"
                  className={forecastHours === option.hours ? "is-active" : ""}
                  aria-pressed={forecastHours === option.hours}
                  onClick={() => changeForecast(option.hours)}
                >
                  <span>{option.hours === 0 ? "Now" : `+${option.hours}h`}</span>
                  <strong>{option.riskScore}/100</strong>
                  <small>{option.maximumTemperatureC}°C peak</small>
                  {option.hours === bestDeparture?.hours && <em>BEST</em>}
                </button>
              ))}
            </div>
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
                  <p>Drink before departure and reassess at your destination.</p>
                  <span>250 mL water</span>
                </div>
              </article>
            )}
          </section>

          <button
            className={
              tripAlertArmed ? "alert-toggle is-success" : "alert-toggle"
            }
            type="button"
            onClick={() => setTripAlertArmed((current) => !current)}
            aria-pressed={tripAlertArmed}
          >
            <BellRing aria-hidden="true" size={17} />
            {tripAlertArmed ? "Trip heat alerts on" : "Turn on trip heat alerts"}
          </button>
          {tripAlertMessage && (
            <p
              className={
                selectedRoute.riskBand === "high" ||
                selectedRoute.riskBand === "critical"
                  ? "personal-alert is-warning"
                  : "personal-alert"
              }
              role="status"
            >
              {tripAlertMessage}
            </p>
          )}
        </aside>
      </main>

      <section className="agent-dock" aria-label="HeatMan agent">
        <div className="agent-dock__identity">
          <span className="agent-avatar" aria-hidden="true">
            <Bot size={18} />
          </span>
          <div>
            <strong>HeatMan agent</strong>
            <span>Route · timing · protection</span>
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
          <label htmlFor="agent-query">Ask about your trip</label>
          <div>
            <input
              id="agent-query"
              value={agentInput}
              onChange={(event) => setAgentInput(event.target.value)}
              placeholder="e.g. Is leaving later safer?"
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
            Miami · {surface === "teams" ? "Teams operations" : "Personal trip"}
          </span>
          <span>Thermal score is decision support—not medical advice.</span>
        </p>
      </footer>
    </div>
  );
}

function personalProfileFor(
  profileMode: PersonalProfileMode,
): RiderProfile {
  return {
    ...DEFAULT_PERSONAL_PROFILE,
    acclimatized: profileMode === "everyday",
    heatSensitivity:
      profileMode === "heat-sensitive" ? "elevated" : "standard",
  };
}

function rescoreCandidates(
  candidates: RouteCandidate[],
  heatPoints: HeatPoint[],
  profile: RiderProfile,
) {
  return candidates.map((route) =>
    scoreRoute(
      {
        id: route.id,
        name: route.name,
        coordinates: route.coordinates,
        durationSeconds: route.durationMinutes * 60,
        distanceMeters: route.distanceKm * 1000,
        steps: route.steps,
      },
      heatPoints,
      profile,
    ),
  );
}

function buildDepartureOptions(
  candidates: RouteCandidate[],
  heatPoints: HeatPoint[],
  profile: RiderProfile,
) {
  return [0, 1, 3].map((hours) => {
    const projected = projectHeatPoints(heatPoints, hours);
    const rescored = rescoreCandidates(candidates, projected, profile);
    const recommended = chooseCoolestSafeRoute(rescored) ?? rescored[0];
    return {
      hours,
      riskScore: recommended.riskScore,
      maximumTemperatureC: recommended.maximumTemperatureC,
    };
  });
}

async function geocodeLocation(query: string): Promise<GeocodeResult> {
  const response = await fetch(
    `/api/geocode?q=${encodeURIComponent(query.trim())}`,
    { cache: "no-store" },
  );
  const payload = await response.json();
  if (!response.ok || payload.error) {
    throw new Error(
      payload.message ?? `HeatMan could not find “${query.trim()}”.`,
    );
  }
  if (payload.configured === false) return { configured: false };
  if (
    !Array.isArray(payload.coordinate) ||
    payload.coordinate.length < 2 ||
    !payload.coordinate.every(
      (value: unknown) => typeof value === "number" && Number.isFinite(value),
    )
  ) {
    throw new Error(`HeatMan could not find “${query.trim()}”.`);
  }
  return {
    configured: true,
    coordinate: [payload.coordinate[0], payload.coordinate[1]],
  };
}

const DEFAULT_PERSONAL_PROFILE: RiderProfile = {
  acclimatized: true,
  carryingLoadKg: 1,
  shiftMinutesCompleted: 20,
  hydrationMl: 750,
  heatSensitivity: "standard",
};

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
