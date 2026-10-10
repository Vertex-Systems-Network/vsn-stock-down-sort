import { execFileSync, spawn, spawnSync } from "node:child_process";
import process from "node:process";
import { pathToFileURL } from "node:url";

const startupTimeoutMs = 180_000;

// Only probe URLs printed by this Dev process, never arbitrary remote URLs or
// guessed ports that might belong to another app. CLI output may contain ANSI.
export function discoverHealthUrls(output) {
  const plain = output.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
  return [...new Set(
    [...plain.matchAll(/http:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):\d+\//g)]
      .map(([url]) => new URL("/healthz", url).href),
  )];
}

export async function probeHealth(url) {
  try {
    const response = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(3000),
      headers: { "Cache-Control": "no-cache" },
    });
    const payload = await response.json();
    return response.status === 200 && payload?.ok === true &&
      payload?.environment === "development" &&
      payload?.billingTestMode === true && payload?.database === "sqlite";
  } catch {
    return false;
  }
}

export async function waitForHealth({
  candidates, getFailure, probe = probeHealth, timeoutMs = startupTimeoutMs,
  now = Date.now, pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    if (getFailure()) throw getFailure();
    for (const url of candidates) {
      if (await probe(url)) {
        if (getFailure()) throw getFailure();
        return url;
      }
    }
    await pause(1500);
  }
  throw new Error(
    `Shopify Dev did not expose a healthy Local SQLite endpoint within ${timeoutMs / 1000}s. Check the Dev output for login, tunnel, or startup errors.`,
  );
}

function preflight() {
  const branch = execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim();
  if (branch !== "development") throw new Error("Local certification must run from development.");
  if (execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()) {
    throw new Error("Working tree must be clean before Local certification; commit the exact code first.");
  }
}

function stopDev(dev) {
  if (!dev.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(dev.pid), "/t", "/f"], { stdio: "ignore" });
  } else {
    try { process.kill(-dev.pid, "SIGTERM"); } catch { /* already stopped */ }
  }
}

async function main() {
  preflight();
  console.log("[local-certification] starting normal Shopify Dev with its public webhook tunnel");
  console.log("[local-certification] complete any Shopify login prompt if it appears");
  const dev = spawn("npm", ["run", "dev"], {
    stdio: ["inherit", "pipe", "pipe"], env: process.env,
    shell: process.platform === "win32", detached: process.platform !== "win32",
  });
  const candidates = new Set();
  let failure;
  // Keep separate bounded buffers so fragmented stdout/stderr URLs are parsed.
  for (const [stream, destination] of [[dev.stdout, process.stdout], [dev.stderr, process.stderr]]) {
    let output = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      destination.write(chunk);
      output = (output + chunk).slice(-8192);
      for (const url of discoverHealthUrls(output)) candidates.add(url);
    });
  }
  dev.once("error", (error) => { failure = error; });
  dev.once("exit", (code, signal) => {
    failure = new Error(`Shopify Dev stopped (code=${code}, signal=${signal ?? "none"}).`);
  });
  const interrupt = () => { stopDev(dev); process.exit(130); };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  try {
    const healthUrl = await waitForHealth({ candidates, getFailure: () => failure });
    console.log(`[local-certification] health checks passed at ${healthUrl}; certifying current source`);
    const result = spawnSync(process.execPath, ["scripts/certify-local-dev.mjs", healthUrl], {
      stdio: "inherit", env: process.env,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Local certification failed (code=${result.status}).`);
    console.log("[local-certification] Shopify Dev remains running; press Ctrl+C when finished.");
  } catch (error) {
    stopDev(dev);
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[local-certification] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
