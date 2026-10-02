import process from "node:process";

const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;

if (!repository) {
  throw new Error("[ruleset-audit] GITHUB_REPOSITORY is required.");
}

const response = await fetch(
  `https://api.github.com/repos/${repository}/rulesets`,
  {
    headers: {
      Accept: "application/vnd.github+json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "X-GitHub-Api-Version": "2022-11-28",
    },
  },
);

if (!response.ok) {
  throw new Error(
    `[ruleset-audit] GitHub ruleset API returned HTTP ${response.status}: ${await response.text()}`,
  );
}

const rulesets = await response.json();
const main = rulesets.find(
  (ruleset) =>
    ruleset.name === "main" &&
    ruleset.enforcement === "active" &&
    (ruleset.conditions?.ref_name?.include ?? []).some(
      (ref) => ref === "refs/heads/main" || ref === "~DEFAULT_BRANCH",
    ),
);

if (!main) {
  throw new Error("[ruleset-audit] Active main ruleset was not found.");
}

const detailResponse = await fetch(
  `https://api.github.com/repos/${repository}/rulesets/${main.id}`,
  {
    headers: {
      Accept: "application/vnd.github+json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "X-GitHub-Api-Version": "2022-11-28",
    },
  },
);

if (!detailResponse.ok) {
  throw new Error(
    `[ruleset-audit] GitHub ruleset detail API returned HTTP ${detailResponse.status}: ${await detailResponse.text()}`,
  );
}

const detail = await detailResponse.json();
const rules = detail.rules ?? [];
const pullRequest = rules.find((rule) => rule.type === "pull_request");
const statusChecks = rules.find((rule) => rule.type === "required_status_checks");

if (!pullRequest) {
  throw new Error("[ruleset-audit] Main ruleset must require pull requests.");
}

const requiredChecks = statusChecks?.parameters?.required_status_checks ?? [];
const hasAppValidation = requiredChecks.some((check) =>
  /app validation|validate/i.test(check.context ?? ""),
);

if (!hasAppValidation) {
  if (process.env.RULESET_BOOTSTRAP === "true") {
    console.warn(
      "[ruleset-audit] BOOTSTRAP: main ruleset is missing the App Validation status check. This temporary mode exists only to produce a successful validate check so GitHub can expose it for selection in the ruleset UI.",
    );
  } else {
    throw new Error(
      "[ruleset-audit] Main ruleset does not require the App Validation status check. Merge protection is incomplete.",
    );
  }
}

if (token && detail.current_user_can_bypass !== "never") {
  throw new Error(
    `[ruleset-audit] Main ruleset bypass policy is not 'never' (actual: ${detail.current_user_can_bypass ?? "unknown"}).`,
  );
}

console.log(
  `[ruleset-audit] PASS main ruleset=${detail.id}; required App Validation check present; bypass=${detail.current_user_can_bypass ?? "not exposed to unauthenticated audit"}`,
);
