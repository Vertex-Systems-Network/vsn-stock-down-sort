"""Select an exact-source Dev gate without reusing stale environment evidence."""

def select_dev_gate(gates, source_ref):
    cloud = gates.get("cloud_dev") or {}
    evidence = cloud.get("evidence_record") or {}
    if cloud.get("status") == "accepted" and cloud.get("accepted_source_ref") == source_ref:
        required = ("prisma_validate", "prisma_generate", "prisma_migrate_deploy", "sqlite_roundtrip",
                    "deletion_safe_write", "runtime_health", "billing_catalog", "contract_tests", "build")
        if (evidence.get("verification_mode") != "github_actions_cloud_sqlite_runtime"
                or evidence.get("credential_mode") != "synthetic_ci_only"
                or evidence.get("merchant_runtime_acceptance") != "pending_staging"
                or evidence.get("repository") != "Vertex-Systems-Network/vsn-stock-down-sort"
                or not str(evidence.get("workflow_run_id") or "").isdigit()
                or int(evidence["workflow_run_id"]) <= 0
                or evidence.get("database_provider") != "sqlite"
                or any(evidence.get(key) != "passed" for key in required)):
            raise ValueError("Cloud Dev acceptance evidence is incomplete; Staging is blocked.")
        return cloud
    return gates.get("local_dev") or {}
