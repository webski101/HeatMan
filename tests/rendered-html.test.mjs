import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
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
  assert.match(html, /Miami thermal route map/);
  assert.match(html, /MIAMI SIMULATION/);
  assert.doesNotMatch(html, /codex-preview|Starter Project|react-loading-skeleton/);
});

test("keeps secrets server-side, preserves rider mode, and ships the Hallmark system", async () => {
  const [gitignore, exampleEnv, tokens, packageJson, appSource, teamsSource] =
    await Promise.all([
    readFile(new URL("../.gitignore", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
    readFile(new URL("../tokens.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../components/HeatManApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/DispatcherDashboard.tsx", import.meta.url), "utf8"),
    ]);

  assert.match(gitignore, /\.env\.\*/);
  assert.match(exampleEnv, /FORTYGUARD_API_KEY=/);
  assert.match(exampleEnv, /MAPBOX_ACCESS_TOKEN=/);
  assert.match(tokens, /Hallmark · macrostructure: Workbench/);
  assert.match(tokens, /--color-accent:/);
  assert.match(packageJson, /"build": "vinext build"/);
  assert.match(appSource, /ACTIVE DELIVERY/);
  assert.match(appSource, /HeatMan agent/);
  assert.match(teamsSource, /Fleet heat command center/);
  assert.match(teamsSource, /Daily fleet exposure/);
  assert.doesNotMatch(exampleEnv, /api-key:\s*[A-Za-z0-9]/i);
});
