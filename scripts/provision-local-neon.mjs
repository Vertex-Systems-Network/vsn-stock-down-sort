import fs from "node:fs";
import process from "node:process";

const API = "https://console.neon.tech/api/v2";
const PROJECT_NAME = "vsn-stock-down-sort-local";
const REGION_ID = process.env.NEON_REGION_ID || "aws-ap-southeast-1";
const PG_VERSION = Number(process.env.NEON_PG_VERSION || "18");

function fail(message) {
  throw new Error(`[local-neon-provision] ${message}`);
}

function loadLocalEnvIfPresent() {
  if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");
  else if (fs.existsSync(".env")) process.loadEnvFile(".env");
}

function requiredToken() {
  const token = process.env.NEON_API_KEY?.trim();
  if (!token) {
    fail(
      "NEON_API_KEY is required. Create/use a Neon API key locally; never commit it or put it in repository files."
    );
  }
  return token;
}

async function api(token, path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    const detail = body?.message || body?.error || `HTTP ${response.status}`;
    fail(`Neon API request failed: ${detail}`);
  }
  return body;
}

async function findProject(token) {
  const params = new URLSearchParams({ search: PROJECT_NAME, limit: "400" });
  if (process.env.NEON_ORG_ID?.trim()) params.set("org_id", process.env.NEON_ORG_ID.trim());
  const body = await api(token, `/projects?${params}`);
  const projects = Array.isArray(body.projects) ? body.projects : [];
  const matches = projects.filter((project) => project.name === PROJECT_NAME);
  if (matches.length > 1) {
    fail(`more than one project is named ${PROJECT_NAME}; refusing to guess`);
  }
  return matches[0] || null;
}

async function waitForProjectOperations(token, projectId) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const body = await api(token, `/projects/${projectId}/operations?limit=100`);
    const operations = Array.isArray(body.operations) ? body.operations : [];
    const active = operations.filter((op) =>
      ["queued", "running", "scheduling", "pending"].includes(String(op.status).toLowerCase())
    );
    const failed = operations.filter((op) =>
      ["failed", "error", "canceled", "cancelled"].includes(String(op.status).toLowerCase())
    );
    if (failed.length) fail(`Neon project operation failed: ${failed[0].id}`);
    if (!active.length) return;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  fail("timed out waiting for Neon project operations");
}

async function createProject(token) {
  const project = {
    name: PROJECT_NAME,
    region_id: REGION_ID,
    pg_version: PG_VERSION,
  };
  const body = { project };
  const query = process.env.NEON_ORG_ID?.trim()
    ? `?org_id=${encodeURIComponent(process.env.NEON_ORG_ID.trim())}`
    : "";
  return api(token, `/projects${query}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function getDefaultBranch(token, projectId) {
  const body = await api(token, `/projects/${projectId}/branches?limit=100`);
  const branches = Array.isArray(body.branches) ? body.branches : [];
  const branch = branches.find((item) => item.default === true) ||
    branches.find((item) => item.name === "main") ||
    branches[0];
  if (!branch?.id) fail("no usable default Neon branch was returned");
  return branch;
}

async function getDatabase(token, projectId, branchId) {
  const body = await api(token, `/projects/${projectId}/branches/${branchId}/databases`);
  const databases = Array.isArray(body.databases) ? body.databases : [];
  const database = databases.find((item) => item.name === "neondb") || databases[0];
  if (!database?.name) fail("no PostgreSQL database was returned");
  return database.name;
}

async function getRole(token, projectId, branchId) {
  const body = await api(token, `/projects/${projectId}/branches/${branchId}/roles`);
  const roles = Array.isArray(body.roles) ? body.roles : [];
  const role = roles.find((item) => item.name && item.protected === false && item.no_login !== true) ||
    roles.find((item) => item.name && item.protected !== true && item.no_login !== true) ||
    roles.find((item) => item.name);
  if (!role?.name) fail("no usable PostgreSQL login role was returned");
  return role.name;
}

async function getConnectionUri(token, projectId, branchId, databaseName, roleName, pooled) {
  const params = new URLSearchParams({
    branch_id: branchId,
    database_name: databaseName,
    role_name: roleName,
    pooled: String(pooled),
  });
  const body = await api(token, `/projects/${projectId}/connection_uri?${params}`);
  const uri = body.connection_uri || body.uri;
  if (!uri) fail(`Neon did not return a ${pooled ? "pooled" : "direct"} connection URI`);
  return uri;
}

function upsertEnv(file, values) {
  const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const lines = existing.split(/\r?\n/);
  for (const [key, value] of Object.entries(values)) {
    const index = lines.findIndex((line) => line.startsWith(`${key}=`));
    const line = `${key}=${value}`;
    if (index >= 0) lines[index] = line;
    else lines.push(line);
  }
  fs.writeFileSync(file, lines.filter((line, index, arr) => !(index === arr.length - 1 && line === "")).join("\n") + "\n");
}

function redact(uri) {
  const url = new URL(uri);
  return `${url.protocol}//${url.username}:***@${url.hostname}${url.pathname}`;
}

async function main() {
  loadLocalEnvIfPresent();
  const token = requiredToken();

  let project = await findProject(token);
  let created = false;
  if (!project) {
    project = (await createProject(token)).project;
    if (!project?.id) fail("Neon create-project response did not include a project ID");
    created = true;
    await waitForProjectOperations(token, project.id);
  }

  if (project.name !== PROJECT_NAME) fail("resolved project name does not match Local contract");

  const branch = await getDefaultBranch(token, project.id);
  const databaseName = await getDatabase(token, project.id, branch.id);
  const roleName = await getRole(token, project.id, branch.id);
  const direct = await getConnectionUri(token, project.id, branch.id, databaseName, roleName, false);
  const pooled = await getConnectionUri(token, project.id, branch.id, databaseName, roleName, true);

  upsertEnv(".env.local", {
    NEON_PROJECT_NAME: PROJECT_NAME,
    NEON_PROJECT_ID: project.id,
    DATABASE_URL: pooled,
    DIRECT_URL: direct,
  });

  console.log(`[local-neon-provision] project=${PROJECT_NAME}`);
  console.log(`[local-neon-provision] project_id=${project.id}`);
  console.log(`[local-neon-provision] branch=${branch.id}`);
  console.log(`[local-neon-provision] database=${databaseName}`);
  console.log(`[local-neon-provision] pooled=${redact(pooled)}`);
  console.log(`[local-neon-provision] direct=${redact(direct)}`);
  console.log(`[local-neon-provision] action=${created ? "created" : "reused-existing-exact-name"}`);
  console.log("[local-neon-provision] credentials written only to .env.local (gitignored)");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
