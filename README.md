# HeatMan

HeatMan is a heat-aware navigation and safety system for delivery riders and
their dispatch teams in Miami. It compares OpenRouteService walking/cycling alternatives
against FortyGuard temperature tiles, scores cumulative exposure, selects the
coolest safe route, and turns the result into concrete hydration, rest, timing,
alert, and dispatch actions.

The app remains fully interactive without credentials by using a clearly
labeled Miami simulation. Adding API keys switches routing and heat retrieval
to the live providers.

## Product capabilities

- OpenRouteService multi-route cycling and walking alternatives
- MapLibre interactive map with OpenFreeMap street tiles
- FortyGuard asynchronous heatmap submission and result polling
- Thermal-cost route scoring in °C·min
- Rider risk model using exposure, carried load, shift duration, hydration, and
  acclimatization
- Cool-route recommendation with a bounded detour
- Hydration/rest plan, rider heat alerts, and Teams dispatch controls
- Natural-language route agent that takes actions
- Current, +1 hour, and +3 hour micro-hotspot projections
- Cooling-stop recommendations
- Responsive simulated route and heat fallback when a live provider is unavailable

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

MapLibre and OpenFreeMap do not require credentials.

## Miami API probe

The first integration gate is a live heatmap request for a compact
Downtown Miami AOI. It uses the highest spatial resolution currently
documented by FortyGuard (60 m), polls the asynchronous status endpoint, and
reports tile density and returned property fields.

Run:

   ```powershell
 npm.cmd run probe:miami
   ```

The raw completed response is written to
`artifacts/fortyguard-miami-probe.json`, which is ignored by Git.

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
