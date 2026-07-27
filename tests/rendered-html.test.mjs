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

test("server-renders the HeatGuard fleet command center", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>HeatGuard/);
  assert.match(html, /Fleet heat command center/);
  assert.match(html, /Live Miami fleet heat map/);
  assert.match(html, /Rider risk queue/);
  assert.match(html, /Send cooler route/);
  assert.match(html, /Daily fleet exposure/);
  assert.match(html, /MIAMI SIMULATION/);
  assert.doesNotMatch(html, /codex-preview|Starter Project|react-loading-skeleton/);
});

test("keeps secrets server-side, preserves rider mode, and ships the Hallmark system", async () => {
  const [gitignore, exampleEnv, tokens, packageJson, appSource] = await Promise.all([
    readFile(new URL("../.gitignore", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
    readFile(new URL("../tokens.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../components/HeatGuardApp.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(gitignore, /\.env\.\*/);
  assert.match(exampleEnv, /FORTYGUARD_API_KEY=/);
  assert.match(exampleEnv, /MAPBOX_ACCESS_TOKEN=/);
  assert.match(tokens, /Hallmark · macrostructure: Workbench/);
  assert.match(tokens, /--color-accent:/);
  assert.match(packageJson, /"build": "vinext build"/);
  assert.match(appSource, /Route the heat, not just the miles\./);
  assert.match(appSource, /HeatGuard agent/);
  assert.doesNotMatch(exampleEnv, /api-key:\s*[A-Za-z0-9]/i);
});
