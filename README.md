# HeatMan

HeatMan is a heat-aware navigation and safety system for delivery riders and
their dispatch teams in New York City. It compares OpenRouteService walking/cycling alternatives
against FortyGuard temperature tiles, scores cumulative exposure, selects the
coolest safe route, and turns the result into concrete hydration, rest, timing,
alert, and dispatch actions.

The starter screen is a clearly labeled New York simulation. With the configured
keys, address search and routing use OpenRouteService, heat requests use
FortyGuard, and the +1/+2 hour controls request native FortyGuard forecast
heatmaps. If a current query has no tiles, the app returns to a clearly labeled
simulation rather than presenting historical data as live.

## Product capabilities

- OpenRouteService New York City address search plus cycling and walking alternatives
- MapLibre interactive map with OpenFreeMap street tiles
- FortyGuard asynchronous heatmap submission and result polling
- Thermal-cost route scoring in °C·min
- Rider risk model using exposure, carried load, shift duration, hydration, and
  acclimatization
- Cool-route recommendation with a bounded detour
- Hydration/rest plan and route-aware rider risk guidance
- Deterministic natural-language decision agent for route and safety actions
- Current, +1 hour, and +2 hour native FortyGuard heat fields
- Official-library indoor cooling options near the destination
- Clerk-protected Teams workspace with optional Supabase persistence and realtime
  synchronization (illustrative riders; no live fleet GPS or outbound SMS yet)

## Run locally

1. Copy `.env.example` to `.env.local`.
2. Add any available provider credentials.
3. Run:

   ```powershell
   npm.cmd install
   npm.cmd run dev
   ```

Use `npm.cmd test` for the production build and server-render checks.

## Environment

- `FORTYGUARD_API_KEY` — server-side FortyGuard requests
- `OPENROUTESERVICE_API_KEY` — server-side walking/cycling Directions requests
- `NEXT_PUBLIC_SUPABASE_URL` — public Supabase project URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — public Supabase browser key; access is
  protected by Clerk session tokens and Row Level Security

MapLibre and OpenFreeMap do not require credentials.

## Supabase company fleet setup

HeatMan uses Clerk for accounts and Supabase for organization-scoped fleet
records and realtime updates. The app never needs a Supabase service-role key.

1. Create a free Supabase project.
2. In Clerk, enable the native Supabase integration and copy the Clerk instance
   domain it provides.
3. In Supabase, open **Authentication → Sign In / Providers**, add Clerk as a
   Third-Party Auth provider, and paste that Clerk domain.
4. In the Supabase SQL Editor, run
   `supabase/migrations/202608200001_heatman_fleet.sql`.
5. Copy the Supabase project URL and publishable key into `.env.local` using the
   names shown in `.env.example`. Add the same two variables to Vercel for
   Production and Preview, then redeploy.

The first signed-in organization seeds the explicitly illustrative starter
fleet into its own rows. Dispatcher changes then persist and synchronize across
open Teams sessions through Supabase Realtime. Row Level Security prevents one
Clerk organization from reading or changing another organization’s records.

## New York API probe

The first integration gate is a live heatmap request for a compact
Lower Manhattan AOI. It uses the highest spatial resolution currently
documented by FortyGuard (60 m), polls the asynchronous status endpoint, and
reports tile density and returned property fields.

Run:

   ```powershell
 npm.cmd run probe:new-york
   ```

The raw completed response is written to
`artifacts/fortyguard-new-york-probe.json`, which is ignored by Git.

## Confirmed FortyGuard API contract

- Submit: `POST https://api.fortyguard.com/v1/heatmap`
- Poll/result: `GET https://api.fortyguard.com/v1/status/{activity_id}`
- Authentication header: `api-key`
- Heatmap granularity: 60, 80, or 100 m
- Heatmap forecast horizon: up to 12 hours
- Maximum heatmap AOI: 10 mi² on Basic/Startup; 50 mi² on Premium
- Regional coverage in the current release: United States

The API documentation does not currently publish a requests-per-minute rate
limit. The probe therefore polls conservatively every 10 seconds and honors a
`Retry-After` response when present.

Important terminology: FortyGuard's “2-meter temperature” describes air
temperature at approximately 2 m above ground. The documented API's spatial
grid is currently 60–100 m.
