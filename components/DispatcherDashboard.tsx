"use client";

/*
THESIS: Fleet heat risk becomes a live dispatch queue, not a passive weather layer.
OWN-WORLD: Inherit HeatMan's cobalt workbench, ruled panels, compact data labels,
and street-map field with semantic risk colors.
STORY: See who is exposed, understand why, intervene, then verify the fleet result.
FIRST VIEWPORT: Fleet roster left, shared New York map center, selected-rider action
rail right; critical alerts are visible before scrolling.
FORM: Established-world Operate extension; command-center staging; no concept seed
because the approved feature set and incumbent surface define the structure.
*/

import { useEffect, useRef, useState } from "react";
import { useSession } from "@clerk/nextjs";
import {
  BellRing,
  Bike,
  CalendarClock,
  Check,
  Clock3,
  Database,
  Download,
  Filter,
  MapPin,
  MessageSquareText,
  Navigation,
  ShieldAlert,
  ThermometerSun,
  Users,
} from "lucide-react";
import {
  INITIAL_FLEET,
  type FleetRider,
} from "@/lib/fleet-data";
import {
  createFleetSupabaseClient,
  fleetRiderToRow,
  fleetRowToRider,
  isFleetSupabaseConfigured,
  type FleetActivityRow,
  type FleetRiderRow,
  type FleetSupabaseClient,
  type FleetSyncState,
} from "@/lib/supabase-fleet";

type DispatcherDashboardProps = {
  organizationId: string;
  dataMode:
    | "demo"
    | "loading"
    | "live"
    | "forecast"
    | "error";
  onRiderAction?: (riderId: string, action: string) => void;
};

type FleetFilter = "all" | "elevated";
const fleetSupabaseConfigured = isFleetSupabaseConfigured();

export function DispatcherDashboard({
  organizationId,
  dataMode,
  onRiderAction,
}: DispatcherDashboardProps) {
  const { session } = useSession();
  const [riders, setRiders] = useState(INITIAL_FLEET);
  const [selectedRiderId, setSelectedRiderId] = useState(INITIAL_FLEET[0].id);
  const [fleetFilter, setFleetFilter] = useState<FleetFilter>("all");
  const [autoAlerts, setAutoAlerts] = useState(true);
  const [message, setMessage] = useState(
    "Heat risk is elevated. Take the next shaded break and confirm when stopped.",
  );
  const [activity, setActivity] = useState([
    "Automatic alert raised for D-091 at 13:42",
    "Cool-route recommendation sent to D-204 at 13:39",
  ]);
  const [syncState, setSyncState] = useState<FleetSyncState>(() =>
    fleetSupabaseConfigured ? "connecting" : "demo",
  );
  const [syncMessage, setSyncMessage] = useState(() =>
    fleetSupabaseConfigured
      ? "Waiting for the signed-in company session."
      : "Supabase keys are not configured; using the safe demo fleet.",
  );
  const fleetClientRef = useRef<FleetSupabaseClient | null>(null);

  useEffect(() => {
    if (!fleetSupabaseConfigured) {
      fleetClientRef.current = null;
      return;
    }

    if (!session) {
      fleetClientRef.current = null;
      return;
    }

    let disposed = false;
    let fleetLoaded = false;
    let realtimeSubscribed = false;
    const client = createFleetSupabaseClient(() => session.getToken());
    fleetClientRef.current = client;

    function markLiveWhenReady() {
      if (!disposed && fleetLoaded && realtimeSubscribed) {
        setSyncState("live");
        setSyncMessage("Company fleet records are stored and updating in real time.");
      }
    }

    async function loadFleet() {
      const { data, error } = await client
        .from("fleet_riders")
        .select("*")
        .eq("organization_id", organizationId)
        .order("risk_score", { ascending: false });

      if (error) throw error;
      if (disposed) return;

      let rows = (data ?? []) as FleetRiderRow[];
      if (rows.length === 0) {
        const { data: seededData, error: seedError } = await client
          .from("fleet_riders")
          .upsert(
            INITIAL_FLEET.map((rider) =>
              fleetRiderToRow(organizationId, rider),
            ),
            { onConflict: "organization_id,rider_id" },
          )
          .select();
        if (seedError) throw seedError;
        rows = (seededData ?? []) as FleetRiderRow[];
      }

      if (!disposed && rows.length > 0) {
        setRiders(rows.map(fleetRowToRider));
        setSelectedRiderId((current) =>
          rows.some((row) => row.rider_id === current)
            ? current
            : rows[0].rider_id,
        );
      }
    }

    async function loadActivity() {
      const { data, error } = await client
        .from("fleet_activity")
        .select("id,organization_id,rider_id,message,action_type,created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) throw error;
      if (disposed) return;

      const rows = (data ?? []) as FleetActivityRow[];
      setActivity(
        rows.length
          ? rows.map((row) => row.message)
          : ["Supabase company workspace connected"],
      );
    }

    async function connect() {
      try {
        await Promise.all([loadFleet(), loadActivity()]);
        if (!disposed) {
          fleetLoaded = true;
          setSyncMessage("Company fleet records are stored and updating in real time.");
          markLiveWhenReady();
        }
      } catch (error) {
        if (!disposed) {
          setSyncState("error");
          setSyncMessage(fleetSyncErrorMessage(error));
        }
      }
    }

    const channel = client
      .channel(`heatman-fleet-${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "fleet_riders",
          filter: `organization_id=eq.${organizationId}`,
        },
        () => {
          void loadFleet().catch((error) => {
            if (!disposed) {
              setSyncState("error");
              setSyncMessage(fleetSyncErrorMessage(error));
            }
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "fleet_activity",
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          const entry = payload.new as FleetActivityRow;
          setActivity((current) =>
            [entry.message, ...current.filter((item) => item !== entry.message)].slice(
              0,
              5,
            ),
          );
        },
      )
      .subscribe((status) => {
        if (disposed) return;
        if (status === "SUBSCRIBED") {
          realtimeSubscribed = true;
          markLiveWhenReady();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setSyncState("error");
          setSyncMessage("Supabase realtime disconnected; saved data remains available.");
        }
      });

    void connect();

    return () => {
      disposed = true;
      if (fleetClientRef.current === client) {
        fleetClientRef.current = null;
      }
      void client.removeChannel(channel);
    };
  }, [organizationId, session]);

  const selectedRider =
    riders.find((rider) => rider.id === selectedRiderId) ?? riders[0];
  const elevatedRiders = riders.filter((rider) => rider.riskScore >= 70);
  const visibleRiders =
    fleetFilter === "elevated" ? elevatedRiders : riders;
  const totalHotMinutes = riders.reduce(
    (total, rider) => total + rider.hotMinutes,
    0,
  );
  const averageRisk = Math.round(
    riders.reduce((total, rider) => total + rider.riskScore, 0) / riders.length,
  );
  const reportHref = `data:text/csv;charset=utf-8,${encodeURIComponent(
    buildFleetCsv(riders),
  )}`;

  function updateRider(
    riderId: string,
    update: (rider: FleetRider) => FleetRider,
  ) {
    const currentRider = riders.find((rider) => rider.id === riderId);
    if (!currentRider) return;
    const nextRider = update(currentRider);
    setRiders((current) =>
      current.map((rider) => (rider.id === riderId ? nextRider : rider)),
    );
    void persistRider(nextRider);
  }

  async function persistRider(rider: FleetRider) {
    const client = fleetClientRef.current;
    if (!client) return;
    const { error } = await client
      .from("fleet_riders")
      .upsert(fleetRiderToRow(organizationId, rider), {
        onConflict: "organization_id,rider_id",
      });
    if (error) {
      setSyncState("error");
      setSyncMessage(fleetSyncErrorMessage(error));
    }
  }

  function rerouteSelected() {
    updateRider(selectedRider.id, (rider) => ({
      ...rider,
      alertState: "delivered",
      lastIntervention: "Cooler route sent · awaiting rider",
      status: "Route awaiting rider",
    }));
    addActivity(
      `Cooler route sent to ${selectedRider.id}; awaiting rider acceptance`,
      selectedRider.id,
      "cooler_route",
    );
    onRiderAction?.(
      selectedRider.id,
      "Dispatch sent a cooler route. Review and accept it before continuing.",
    );
  }

  function scheduleBreak() {
    updateRider(selectedRider.id, (rider) => ({
      ...rider,
      alertState: "delivered",
      lastIntervention: "Cooling break sent · awaiting rider",
      status: "Break awaiting rider",
    }));
    addActivity(
      `12-minute cooling break sent to ${selectedRider.id}`,
      selectedRider.id,
      "cooling_break",
    );
    onRiderAction?.(
      selectedRider.id,
      "Dispatch scheduled a 12-minute cooling break at the next safe stop.",
    );
  }

  function rescheduleShift() {
    updateRider(selectedRider.id, (rider) => ({
      ...rider,
      shift: shiftByMinutes(rider.shift, 30),
      lastIntervention: "Shift moved +30 min",
      status: "Shift moved +30 min",
    }));
    addActivity(
      `${selectedRider.id} shift moved 30 minutes later`,
      selectedRider.id,
      "shift_change",
    );
    onRiderAction?.(
      selectedRider.id,
      "Dispatch moved this shift 30 minutes later to reduce peak-heat exposure.",
    );
  }

  function sendMessage() {
    if (!message.trim()) return;
    updateRider(selectedRider.id, (rider) => ({
      ...rider,
      alertState: "delivered",
      lastIntervention: "Safety message queued",
      status: "Safety message queued",
    }));
    addActivity(
      `Safety message queued for ${selectedRider.id}; no SMS was sent`,
      selectedRider.id,
      "safety_message",
    );
    onRiderAction?.(selectedRider.id, message.trim());
  }

  function acknowledgeAlert() {
    updateRider(selectedRider.id, (rider) => ({
      ...rider,
      alertState: "acknowledged",
      lastIntervention: "Rider acknowledged safety check",
      status: "Safety check acknowledged",
    }));
    addActivity(
      `${selectedRider.id} safety alert marked acknowledged`,
      selectedRider.id,
      "alert_acknowledged",
    );
  }

  function addActivity(
    entry: string,
    riderId: string | null = null,
    actionType = "dispatcher_action",
  ) {
    setActivity((current) =>
      [entry, ...current.filter((item) => item !== entry)].slice(0, 5),
    );
    const client = fleetClientRef.current;
    if (!client) return;
    void client
      .from("fleet_activity")
      .insert({
        organization_id: organizationId,
        rider_id: riderId,
        message: entry,
        action_type: actionType,
      })
      .then(({ error }) => {
        if (error) {
          setSyncState("error");
          setSyncMessage(fleetSyncErrorMessage(error));
        }
      });
  }

  return (
    <main id="command-center" className="dispatch-shell">
      <section className="dispatch-heading">
        <div>
          <span className="panel-kicker">
            {syncState === "live" ? "COMPANY OPERATIONS · SUPABASE REALTIME" : "DEMO OPERATIONS"}
            {dataMode === "live" ? " · LIVE HEAT" : ""} · ILLUSTRATIVE RIDERS · NO FLEET GPS OR SMS
          </span>
          <h1>
            {syncState === "live"
              ? "Fleet heat command center"
              : "Fleet heat command center preview"}
          </h1>
          <p>
            {syncState === "live"
              ? "Dispatcher actions are saved to your company workspace and synchronized across open HeatMan sessions."
              : "Explore the dispatcher workflow with illustrative riders. Connect Supabase to persist and synchronize company operations."}
          </p>
        </div>
        <div className="dispatch-heading__actions">
          <span
            className={`fleet-sync fleet-sync--${syncState}`}
            role="status"
            title={syncMessage}
          >
            <Database aria-hidden="true" size={16} />
            {syncState === "live"
              ? "Database live"
              : syncState === "connecting"
                ? "Connecting data"
                : syncState === "error"
                  ? "Database unavailable"
                  : "Demo data"}
          </span>
          <button
            type="button"
            className={autoAlerts ? "auto-alert is-active" : "auto-alert"}
            aria-pressed={autoAlerts}
            onClick={() => {
              setAutoAlerts((current) => !current);
              addActivity(
                autoAlerts
                  ? "Automatic heat alerts paused"
                  : "Automatic heat alerts armed",
              );
            }}
          >
            <BellRing aria-hidden="true" size={16} />
            Demo alerts {autoAlerts ? "on" : "off"}
          </button>
          <a
            className="secondary-action"
            href={reportHref}
            download="heatman-new-york-fleet-exposure.csv"
            onClick={() => addActivity("Daily fleet exposure report exported")}
          >
            <Download aria-hidden="true" size={16} />
            Export daily report
          </a>
        </div>
      </section>

      <section className="fleet-summary" aria-label="Fleet heat summary">
        <article>
          <Users aria-hidden="true" size={18} />
          <span>Active riders</span>
          <strong>{riders.length}</strong>
        </article>
        <article>
          <ShieldAlert aria-hidden="true" size={18} />
          <span>High or critical</span>
          <strong>{elevatedRiders.length}</strong>
        </article>
        <article>
          <Clock3 aria-hidden="true" size={18} />
          <span>Fleet hot-minutes</span>
          <strong>{totalHotMinutes}</strong>
        </article>
        <article>
          <ThermometerSun aria-hidden="true" size={18} />
          <span>Average risk</span>
          <strong>{averageRisk}/100</strong>
        </article>
      </section>

      {autoAlerts && elevatedRiders.length > 0 && (
        <section className="fleet-alert" role="alert">
          <ShieldAlert aria-hidden="true" size={19} />
          <div>
            <strong>
              {elevatedRiders.length} riders need intervention
            </strong>
            <span>
              {elevatedRiders
                .map((rider) => `${rider.id} is ${rider.riskBand}`)
                .join("; ")}
              .
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSelectedRiderId(elevatedRiders[0].id)}
          >
            Review highest risk
          </button>
        </section>
      )}

      <section className="dispatch-workspace">
        <aside className="fleet-roster" aria-label="Active rider roster">
          <div className="section-line">
            <h2>Rider risk queue</h2>
            <span>{visibleRiders.length} shown</span>
          </div>
          <div className="roster-filter" aria-label="Filter riders">
            <Filter aria-hidden="true" size={14} />
            <button
              type="button"
              className={fleetFilter === "all" ? "is-active" : ""}
              onClick={() => setFleetFilter("all")}
            >
              All
            </button>
            <button
              type="button"
              className={fleetFilter === "elevated" ? "is-active" : ""}
              onClick={() => setFleetFilter("elevated")}
            >
              High risk
            </button>
          </div>
          <div className="rider-list">
            {visibleRiders.map((rider) => (
              <button
                key={rider.id}
                type="button"
                className={
                  rider.id === selectedRider.id
                    ? "rider-row is-selected"
                    : "rider-row"
                }
                onClick={() => setSelectedRiderId(rider.id)}
                aria-pressed={rider.id === selectedRider.id}
              >
                <span className={`rider-avatar rider-avatar--${rider.riskBand}`}>
                  {rider.initials}
                </span>
                <span className="rider-row__identity">
                  <strong>{rider.name}</strong>
                  <span>{rider.id} · {rider.zone}</span>
                </span>
                <span className="rider-row__risk">
                  <strong>{rider.riskScore}</strong>
                  <span>{rider.riskBand}</span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <FleetMap
          riders={riders}
          selectedRiderId={selectedRider.id}
          onSelectRider={setSelectedRiderId}
          syncState={syncState}
        />

        <aside className="rider-action-panel" aria-label="Selected rider actions">
          <div className="selected-rider-head">
            <span className={`rider-avatar rider-avatar--${selectedRider.riskBand}`}>
              {selectedRider.initials}
            </span>
            <div>
              <span>{selectedRider.id} · {selectedRider.vehicle}</span>
              <h2>{selectedRider.name}</h2>
            </div>
            <span className={`risk-band risk-band--${selectedRider.riskBand}`}>
              {selectedRider.riskBand}
            </span>
          </div>

          <div className="selected-risk">
            <strong>{selectedRider.riskScore}</strong>
            <span>/100 modeled risk</span>
            <div className="risk-meter">
              <span
                style={
                  { "--risk": selectedRider.riskScore } as React.CSSProperties
                }
              />
            </div>
          </div>

          <dl className="rider-facts">
            <div>
              <dt>Current field</dt>
              <dd>{selectedRider.temperatureC}°C</dd>
            </div>
            <div>
              <dt>Hot exposure</dt>
              <dd>{selectedRider.hotMinutes} min</dd>
            </div>
            <div>
              <dt>Next stop</dt>
              <dd>{selectedRider.nextStop}</dd>
            </div>
            <div>
              <dt>ETA</dt>
              <dd>{selectedRider.eta}</dd>
            </div>
            <div>
              <dt>Shift</dt>
              <dd>{selectedRider.shift}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{selectedRider.status}</dd>
            </div>
            <div>
              <dt>Alert delivery</dt>
              <dd>{selectedRider.alertState}</dd>
            </div>
          </dl>

          <div className="intervention-grid">
            <button type="button" className="primary-action" onClick={rerouteSelected}>
              <Navigation aria-hidden="true" size={16} />
              Preview cooler route
            </button>
            <button type="button" className="secondary-action" onClick={scheduleBreak}>
              <Clock3 aria-hidden="true" size={16} />
              Preview break
            </button>
            <button type="button" className="secondary-action" onClick={rescheduleShift}>
              <CalendarClock aria-hidden="true" size={16} />
              Preview shift +30m
            </button>
            {selectedRider.alertState !== "none" &&
              selectedRider.alertState !== "acknowledged" && (
                <button
                  type="button"
                  className="secondary-action"
                  onClick={acknowledgeAlert}
                >
                  <Check aria-hidden="true" size={16} />
                  Mark rider acknowledged
                </button>
              )}
          </div>

          <div className="message-rider">
            <label htmlFor="rider-message">Preview rider message</label>
            <textarea
              id="rider-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={3}
            />
            <button
              type="button"
              className="secondary-action"
              onClick={sendMessage}
              disabled={!message.trim()}
            >
              <MessageSquareText aria-hidden="true" size={16} />
              Queue safety message
            </button>
          </div>
        </aside>
      </section>

      <section className="dispatch-lower">
        <article className="activity-log">
          <div className="section-line">
            <h2>Agent activity</h2>
            <span>latest actions</span>
          </div>
          <ol>
            {activity.map((entry) => (
              <li key={entry}>
                <Check aria-hidden="true" size={14} />
                <span>{entry}</span>
              </li>
            ))}
          </ol>
        </article>

        <article className="exposure-report">
          <div className="section-line">
            <h2>Daily fleet exposure</h2>
            <span>
              {syncState === "live"
                ? "Supabase company records"
                : "illustrative shift data"}
            </span>
          </div>
          <div className="report-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Rider</th>
                  <th>Zone</th>
                  <th>Risk</th>
                  <th>Field</th>
                  <th>Hot min</th>
                  <th>Alert</th>
                  <th>Last intervention</th>
                  <th>Shift status</th>
                </tr>
              </thead>
              <tbody>
                {riders.map((rider) => (
                  <tr key={rider.id}>
                    <td><strong>{rider.id}</strong> {rider.name}</td>
                    <td>{rider.zone}</td>
                    <td><span className={`report-risk report-risk--${rider.riskBand}`}>{rider.riskScore}</span></td>
                    <td>{rider.temperatureC}°C</td>
                    <td>{rider.hotMinutes}</td>
                    <td>{rider.alertState}</td>
                    <td>{rider.lastIntervention}</td>
                    <td>{rider.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </main>
  );
}

function FleetMap({
  riders,
  selectedRiderId,
  onSelectRider,
  syncState,
}: {
  riders: FleetRider[];
  selectedRiderId: string;
  onSelectRider: (riderId: string) => void;
  syncState: FleetSyncState;
}) {
  return (
    <section className="fleet-map" aria-label="Illustrative New York fleet heat map">
      <div className="fleet-map__water" />
      <span className="fleet-street fleet-street--one">Broadway</span>
      <span className="fleet-street fleet-street--two">Canal St</span>
      <span className="fleet-street fleet-street--three">Atlantic Ave</span>
      <span className="fleet-street fleet-street--four">Flatbush Ave</span>
      <div className="fleet-heat fleet-heat--critical">38.1°</div>
      <div className="fleet-heat fleet-heat--high">36.7°</div>
      <div className="fleet-heat fleet-heat--cool">31.1°</div>
      <div className="fleet-map__heading">
        <span><MapPin aria-hidden="true" size={14} /> New York urban core</span>
        <span>
          {syncState === "live" ? "SUPABASE REALTIME" : "ILLUSTRATIVE FLEET"}
          {" · NO LIVE GPS"}
        </span>
      </div>
      {riders.map((rider) => (
        <button
          key={rider.id}
          type="button"
          className={`fleet-marker fleet-marker--${rider.riskBand}${
            rider.id === selectedRiderId ? " is-selected" : ""
          }`}
          style={{ left: `${rider.position.x}%`, top: `${rider.position.y}%` }}
          onClick={() => onSelectRider(rider.id)}
          aria-label={`${rider.name}, ${rider.riskBand} risk, ${rider.temperatureC} degrees Celsius`}
          aria-pressed={rider.id === selectedRiderId}
        >
          <Bike aria-hidden="true" size={15} />
          <span>{rider.id}</span>
        </button>
      ))}
      <div className="fleet-map__legend">
        <span><i className="legend-dot legend-dot--low" />Low</span>
        <span><i className="legend-dot legend-dot--guarded" />Guarded</span>
        <span><i className="legend-dot legend-dot--critical" />High / critical</span>
      </div>
    </section>
  );
}

function shiftByMinutes(shift: string, amount: number) {
  const [start, end] = shift.split("–");
  return `${timeByMinutes(start, amount)}–${timeByMinutes(end, amount)}`;
}

function timeByMinutes(time: string, amount: number) {
  const [hours, minutes] = time.split(":").map(Number);
  const total = hours * 60 + minutes + amount;
  const nextHours = Math.floor(total / 60) % 24;
  const nextMinutes = total % 60;
  return `${String(nextHours).padStart(2, "0")}:${String(nextMinutes).padStart(2, "0")}`;
}

function csvCell(value: string | number) {
  const text = String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function buildFleetCsv(riders: FleetRider[]) {
  const header =
    "rider_id,name,zone,risk_score,risk_band,temperature_c,hot_minutes,alert_state,last_intervention,status";
  const rows = riders.map((rider) =>
    [
      rider.id,
      rider.name,
      rider.zone,
      rider.riskScore,
      rider.riskBand,
      rider.temperatureC,
      rider.hotMinutes,
      rider.alertState,
      rider.lastIntervention,
      rider.status,
    ]
      .map(csvCell)
      .join(","),
  );
  return [header, ...rows].join("\n");
}

function fleetSyncErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/relation .* does not exist|fleet_riders/i.test(message)) {
    return "Supabase is connected, but the HeatMan fleet migration has not been run.";
  }
  if (/row-level security|permission denied|jwt|unauthorized/i.test(message)) {
    return "Supabase rejected the company session. Check the Clerk Third-Party Auth connection and RLS migration.";
  }
  return "Supabase data could not be synchronized; HeatMan kept the local fleet available.";
}
