import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import test from "node:test";
import { discoverHealthUrls, probeHealth, waitForHealth } from "../scripts/certify-local-dev-auto.mjs";

test("discovers dynamic loopback Vite URLs and ignores remote or lookalike hosts", () => {
  assert.deepEqual(discoverHealthUrls(
    "Local: \u001b[36mhttp://localhost:59000/\u001b[0m\n" +
    "http://127.0.0.1:52725/ http://[::1]:3000/ " +
    "https://example.com/ http://localhost.example.com:80/ http://localhost:59000/",
  ), ["http://localhost:59000/healthz", "http://127.0.0.1:52725/healthz", "http://[::1]:3000/healthz"]);
});

test("health probing rejects bad runtime contracts and redirects", async (t) => {
  let payload = { ok: true, environment: "development", billingTestMode: true, database: "sqlite" };
  let status = 200;
  const server = http.createServer((req, res) => {
    res.writeHead(status, { "Content-Type": "application/json", Location: "/healthz" });
    res.end(JSON.stringify(payload));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}/healthz`;
  assert.equal(await probeHealth(url), true);
  for (const change of [{ ok: false }, { environment: "staging" }, { billingTestMode: false }, { database: "postgresql" }]) {
    const original = payload;
    payload = { ...payload, ...change };
    assert.equal(await probeHealth(url), false);
    payload = original;
  }
  status = 302;
  assert.equal(await probeHealth(url), false);
  status = 503;
  assert.equal(await probeHealth(url), false);
});

test("waits for discovered runtime readiness instead of certifying a guessed port", async () => {
  const candidates = new Set();
  let clock = 0;
  const checked = [];
  const result = await waitForHealth({
    candidates, getFailure: () => undefined, now: () => clock, timeoutMs: 5000,
    pause: async () => { clock += 1500; candidates.add("http://localhost:59000/healthz"); },
    probe: async (url) => { checked.push(url); return clock >= 3000; },
  });
  assert.equal(result, "http://localhost:59000/healthz");
  assert.deepEqual(checked, [result, result]);
});

test("Dev exit blocks acceptance even if a health request just succeeded", async () => {
  let failure;
  await assert.rejects(waitForHealth({
    candidates: new Set(["http://localhost:59000/healthz"]), getFailure: () => failure,
    probe: async () => { failure = new Error("Dev stopped"); return true; },
  }), /Dev stopped/);
});

test("startup failure and timeout terminate readiness without certification", async () => {
  await assert.rejects(waitForHealth({ candidates: new Set(), getFailure: () => new Error("spawn failed") }), /spawn failed/);
  let clock = 0;
  await assert.rejects(waitForHealth({
    candidates: new Set(), getFailure: () => undefined, now: () => clock,
    timeoutMs: 3000, pause: async () => { clock += 1500; },
  }), /did not expose a healthy Local SQLite endpoint/);
});

test("auto startup retains the normal webhook tunnel and delegates exact-source certification", () => {
  const source = fs.readFileSync("scripts/certify-local-dev-auto.mjs", "utf8");
  assert.match(source, /spawn\("npm", \["run", "dev"\]/);
  assert.doesNotMatch(source, /--use-localhost|--localhost-port|rejectUnauthorized/);
  assert.match(source, /"scripts\/certify-local-dev.mjs", healthUrl/);
  assert.match(source, /preflight\(\);/);
});
