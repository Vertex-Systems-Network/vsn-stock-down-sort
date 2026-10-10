import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import test from "node:test";

test("cloud Dev runs automatically with SQLite and no live credentials or deployment", () => {
  const workflow = fs.readFileSync(".github/workflows/app-validation.yml", "utf8").split("  cloud-dev:")[1];
  assert.ok(workflow);
  assert.match(workflow, /needs: validate/);
  assert.match(workflow, /APP_ENV: development/);
  assert.match(workflow, /prisma:migrate:local/);
  assert.match(workflow, /node --test tests\/\*\.test\.mjs/);
  assert.match(workflow, /node scripts\/certify-cloud-dev.mjs/);
  assert.match(workflow, /persist-credentials: false/);
  assert.doesNotMatch(workflow, /secrets\.|environment:|deploy --|shopify app/);
});

test("cloud gate requires exact-source complete runtime evidence; stale records do not advance", () => {
  execFileSync("python3", ["-c", `
import sys
sys.path.insert(0, 'scripts')
from dev_acceptance import select_dev_gate
ref='a'*40
checks=('prisma_validate','prisma_generate','prisma_migrate_deploy','sqlite_roundtrip','deletion_safe_write','runtime_health','billing_catalog','contract_tests','build')
e={key:'passed' for key in checks}
e.update(verification_mode='github_actions_cloud_sqlite_runtime',credential_mode='synthetic_ci_only',merchant_runtime_acceptance='pending_staging',repository='Vertex-Systems-Network/vsn-stock-down-sort',workflow_run_id='123',database_provider='sqlite')
cloud=dict(status='accepted',accepted_source_ref=ref,evidence_record=e)
local=dict(status='accepted',accepted_source_ref='b'*40,evidence_record={'legacy':True})
assert select_dev_gate(dict(cloud_dev=cloud,local_dev=local),ref)==cloud
assert select_dev_gate(dict(cloud_dev=cloud,local_dev=local),'b'*40)==local
for key in list(checks)+['workflow_run_id','repository','credential_mode','merchant_runtime_acceptance']:
    bad=dict(e);bad.pop(key)
    try: select_dev_gate(dict(cloud_dev=dict(cloud,evidence_record=bad)),ref)
    except ValueError: pass
    else: raise AssertionError('accepted incomplete evidence: '+key)
assert select_dev_gate(dict(local_dev=local),'b'*40)==local
`]);
});

test("every Staging gate accepts cloud Dev only through the shared exact-source selector", () => {
  for (const name of ["cloudflare-staging-deploy", "staging-readiness", "shopify-staging-version", "shopify-staging-release", "staging-runtime-acceptance"]) {
    const workflow = fs.readFileSync(`.github/workflows/${name}.yml`, "utf8");
    assert.match(workflow, /from dev_acceptance import select_dev_gate/);
    assert.match(workflow, /select_dev_gate\(gates?, source_ref\)/);
    assert.match(workflow, /accepted_source_ref/);
  }
});
