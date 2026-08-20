import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: {
        accept: "text/html",
        // Clerk development instances initialize this cookie during their
        // first browser handshake. Supplying a marker keeps this render test
        // focused on HeatMan's public HTML response.
        cookie: "__clerk_db_jwt=test",
      },
    }),
    {
      CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the HeatMan delivery rider workspace", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>HeatMan/);
  assert.match(html, /Route the heat, not just the miles\./);
  assert.match(html, /Compare thermal routes/);
  assert.match(html, /RIDER RISK/);
  assert.match(html, /Arm dispatch alert/);
  assert.match(html, /New York City thermal route map/);
  assert.match(html, /SIMULATED STARTER/);
  assert.match(html, /Times Square/);
  assert.match(html, /Pacific Library/);
  assert.doesNotMatch(html, /codex-preview|Starter Project|react-loading-skeleton/);
});

test("keeps secrets server-side, preserves rider mode, and ships the Hallmark system", async () => {
  const [gitignore, exampleEnv, tokens, packageJson, appSource, teamsSource, mapSource, layoutSource, proxySource, supabaseSource, supabaseMigration, firebaseClientSource, firebaseAdminSource, pushRouteSource, pushWorkerSource, pushMigration] =
    await Promise.all([
    readFile(new URL("../.gitignore", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
    readFile(new URL("../tokens.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../components/HeatManApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/DispatcherDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/HeatMap.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../proxy.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/supabase-fleet.ts", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../supabase/migrations/202608200001_heatman_fleet.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../lib/firebase-push.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/firebase-admin.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/push/test/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/firebase-messaging-sw.js", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../supabase/migrations/202608200002_push_installations.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    ]);

  assert.match(gitignore, /\.env\.\*/);
  assert.match(exampleEnv, /FORTYGUARD_API_KEY=/);
  assert.match(exampleEnv, /OPENROUTESERVICE_API_KEY=/);
  assert.match(exampleEnv, /NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=/);
  assert.match(exampleEnv, /CLERK_SECRET_KEY=/);
  assert.match(exampleEnv, /NEXT_PUBLIC_SUPABASE_URL=/);
  assert.match(exampleEnv, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=/);
  assert.match(exampleEnv, /NEXT_PUBLIC_FIREBASE_VAPID_KEY=/);
  assert.match(exampleEnv, /FIREBASE_CLIENT_EMAIL=/);
  assert.match(exampleEnv, /FIREBASE_PRIVATE_KEY=/);
  assert.doesNotMatch(exampleEnv, /SUPABASE_SERVICE_ROLE_KEY=/);
  assert.doesNotMatch(exampleEnv, /MAPBOX_ACCESS_TOKEN=/);
  assert.match(tokens, /Hallmark · macrostructure: Workbench/);
  assert.match(tokens, /--color-accent:/);
  assert.match(packageJson, /"build": "vinext build"/);
  assert.match(packageJson, /"@clerk\/nextjs"/);
  assert.match(packageJson, /"@supabase\/supabase-js"/);
  assert.match(packageJson, /"firebase"/);
  assert.match(packageJson, /"firebase-admin"/);
  assert.match(appSource, /ACTIVE DELIVERY/);
  assert.match(appSource, /HeatMan agent/);
  assert.match(appSource, /Sign in or create account/);
  assert.match(appSource, /CreateOrganization/);
  assert.match(appSource, /OrganizationSwitcher/);
  assert.match(appSource, /Share live GPS/);
  assert.match(appSource, /navigator\.geolocation\.watchPosition/);
  assert.match(appSource, /navigator\.geolocation\.clearWatch/);
  assert.match(appSource, /isWithinNewYorkRoutingArea/);
  assert.match(layoutSource, /ClerkProvider/);
  assert.match(proxySource, /clerkMiddleware/);
  assert.match(proxySource, /process\.env\.VERCEL_ENV\s*===\s*"production"/);
  assert.match(proxySource, /startsWith\("pk_live_"\)/);
  assert.match(proxySource, /&& usesProductionClerk/);
  assert.match(proxySource, /frontendApiProxy:\s*\{\s*enabled:\s*true\s*\}/);
  assert.match(teamsSource, /Fleet heat command center/);
  assert.match(teamsSource, /Daily fleet exposure/);
  assert.match(teamsSource, /heatman-new-york-fleet-exposure\.csv/);
  assert.match(teamsSource, /data:text\/csv;charset=utf-8/);
  assert.match(teamsSource, /buildFleetCsv\(riders\)/);
  assert.match(teamsSource, /createFleetSupabaseClient/);
  assert.match(teamsSource, /postgres_changes/);
  assert.match(teamsSource, /SUPABASE REALTIME/);
  assert.match(teamsSource, /Enable push alerts/);
  assert.match(teamsSource, /Send test push/);
  assert.match(teamsSource, /push_installations/);
  assert.match(teamsSource, /\/api\/push\/test/);
  assert.match(supabaseSource, /accessToken: getAccessToken/);
  assert.match(supabaseSource, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(supabaseMigration, /enable row level security/i);
  assert.match(supabaseMigration, /coalesce\(auth\.jwt\(\)->>'org_id', auth\.jwt\(\)->'o'->>'id'\)/);
  assert.match(supabaseMigration, /supabase_realtime/);
  assert.match(firebaseClientSource, /onRegistered/);
  assert.match(firebaseClientSource, /firebaseMessagingSdk\.register/);
  assert.match(firebaseClientSource, /import\("firebase\/messaging"\)/);
  assert.match(firebaseClientSource, /Notification\.requestPermission/);
  assert.match(firebaseAdminSource, /import\("firebase-admin\/messaging"\)/);
  assert.match(firebaseAdminSource, /FIREBASE_PRIVATE_KEY/);
  assert.match(pushRouteSource, /await auth\(\)/);
  assert.match(pushRouteSource, /\.eq\("user_id", userId\)/);
  assert.match(pushRouteSource, /fid: installationId/);
  assert.match(pushWorkerSource, /onBackgroundMessage/);
  assert.match(pushWorkerSource, /notificationclick/);
  assert.match(pushMigration, /push_installations/);
  assert.match(pushMigration, /enable row level security/i);
  assert.match(pushMigration, /user_id = \(select auth\.jwt\(\)->>'sub'\)/);
  assert.doesNotMatch(teamsSource, /heatman-miami-fleet-exposure\.csv/);
  assert.match(mapSource, /FORTYGUARD NATIVE/);
  assert.match(mapSource, /\[0, 1, 2\]/);
  assert.match(mapSource, /temperature and route geometry preserved/);
  assert.match(mapSource, /const MAP_PAINT_COLORS/);
  assert.match(mapSource, /map\.on\("error", failMap\)/);
  assert.match(mapSource, /readinessTimer = window\.setTimeout\(failMap, 8_000\)/);
  assert.doesNotMatch(mapSource, /getPropertyValue\("--color-heat/);
  assert.match(appSource, /native FortyGuard \+\$\{hours\}h New York forecast/);
  assert.match(appSource, /fetchFortyGuardHeat\(aoi, targetDateTime\)/);
  assert.match(appSource, /FortyGuard \+\$\{hours\}h forecast applied/);
  assert.match(appSource, /message\.kind !== "decision" && message\.kind !== "selection"/);
  assert.match(appSource, /HeatMan's current safety recommendation remains/);
  assert.match(appSource, /all routes have equal modeled heat exposure/);
  assert.match(appSource, /no alternative provides a lower modeled heat load/);
  assert.doesNotMatch(appSource, /versus the fastest alternative/);
  assert.doesNotMatch(appSource, /Open-Meteo|fetchOpenMeteoForecast/);
  assert.doesNotMatch(mapSource, /OPEN-METEO/);
  assert.doesNotMatch(mapSource, /SIMULATED \+\$\{forecastHours\}H HEAT MODEL/);
  assert.doesNotMatch(exampleEnv, /api-key:\s*[A-Za-z0-9]/i);
});
