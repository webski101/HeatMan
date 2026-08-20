import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { FleetRider } from "@/lib/fleet-data";

export type FleetSyncState = "demo" | "connecting" | "live" | "error";

export type FleetRiderRow = {
  organization_id: string;
  rider_id: string;
  name: string;
  initials: string;
  vehicle: FleetRider["vehicle"];
  zone: string;
  next_stop: string;
  risk_score: number;
  risk_band: FleetRider["riskBand"];
  temperature_c: number;
  hot_minutes: number;
  shift_window: string;
  eta: string;
  position_x: number;
  position_y: number;
  status: string;
  alert_state: FleetRider["alertState"];
  last_intervention: string;
  updated_at?: string;
};

export type FleetActivityRow = {
  id: string;
  organization_id: string;
  rider_id: string | null;
  message: string;
  action_type: string;
  created_at: string;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function isFleetSupabaseConfigured() {
  return Boolean(supabaseUrl && supabasePublishableKey);
}

export function createFleetSupabaseClient(
  getAccessToken: () => Promise<string | null>,
) {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Supabase fleet environment variables are not configured.");
  }

  return createClient(supabaseUrl, supabasePublishableKey, {
    accessToken: getAccessToken,
    realtime: {
      params: {
        eventsPerSecond: 5,
      },
    },
  });
}

export type FleetSupabaseClient = SupabaseClient;

export function fleetRiderToRow(
  organizationId: string,
  rider: FleetRider,
): FleetRiderRow {
  return {
    organization_id: organizationId,
    rider_id: rider.id,
    name: rider.name,
    initials: rider.initials,
    vehicle: rider.vehicle,
    zone: rider.zone,
    next_stop: rider.nextStop,
    risk_score: rider.riskScore,
    risk_band: rider.riskBand,
    temperature_c: rider.temperatureC,
    hot_minutes: rider.hotMinutes,
    shift_window: rider.shift,
    eta: rider.eta,
    position_x: rider.position.x,
    position_y: rider.position.y,
    status: rider.status,
    alert_state: rider.alertState,
    last_intervention: rider.lastIntervention,
  };
}

export function fleetRowToRider(row: FleetRiderRow): FleetRider {
  return {
    id: row.rider_id,
    name: row.name,
    initials: row.initials,
    vehicle: row.vehicle,
    zone: row.zone,
    nextStop: row.next_stop,
    riskScore: row.risk_score,
    riskBand: row.risk_band,
    temperatureC: row.temperature_c,
    hotMinutes: row.hot_minutes,
    shift: row.shift_window,
    eta: row.eta,
    position: { x: row.position_x, y: row.position_y },
    status: row.status,
    alertState: row.alert_state,
    lastIntervention: row.last_intervention,
  };
}
