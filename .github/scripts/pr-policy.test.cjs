const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  failedRequiredJobs,
  hasIndependentNegativePathApproval,
  hasRequirementReference,
  isAllowedPromotion,
  isSensitiveFile
} = require("./pr-policy.cjs");

const sameRepo = "MahmoudAbaza-AIS/I2P";

test("promotion policy allows same-repository feature to dev, dev to ppr, and ppr to main", () => {
  assert.equal(isAllowedPromotion({
    headRepo: sameRepo, baseRepo: sameRepo, headRef: "feature/add-api", baseRef: "dev"
  }), true);
  assert.equal(isAllowedPromotion({
    headRepo: sameRepo, baseRepo: sameRepo, headRef: "dev", baseRef: "ppr"
  }), true);
  assert.equal(isAllowedPromotion({
    headRepo: sameRepo, baseRepo: sameRepo, headRef: "ppr", baseRef: "main"
  }), true);
});

test("promotion policy rejects wrong sources, direct environment-branch promotion, and fork spoofing", () => {
  for (const promotion of [
    { headRepo: sameRepo, baseRepo: sameRepo, headRef: "main", baseRef: "dev" },
    { headRepo: sameRepo, baseRepo: sameRepo, headRef: "feature/fix", baseRef: "ppr" },
    { headRepo: sameRepo, baseRepo: sameRepo, headRef: "dev", baseRef: "main" },
    { headRepo: "attacker/dev", baseRepo: sameRepo, headRef: "dev", baseRef: "ppr" },
    { headRepo: "attacker/ppr", baseRepo: sameRepo, headRef: "ppr", baseRef: "main" }
  ]) {
    assert.equal(isAllowedPromotion(promotion), false);
  }
});

test("metadata validation accepts requirement IDs and rejects prose without one", () => {
  assert.equal(hasRequirementReference("Implements FR-API-041"), true);
  assert.equal(hasRequirementReference("NFR-SEC-123"), true);
  assert.equal(hasRequirementReference("No requirement reference"), false);
  assert.equal(hasRequirementReference(""), false);
});

test("required checks fail closed for failed, cancelled, skipped, and missing jobs", () => {
  const required = ["build", "secret-scan", "integration", "coverage-gate"];
  assert.deepEqual(failedRequiredJobs({
    build: { result: "success" },
    "secret-scan": { result: "failure" },
    integration: { result: "cancelled" },
    "coverage-gate": { result: "skipped" }
  }, required), ["secret-scan", "integration", "coverage-gate"]);
  assert.deepEqual(failedRequiredJobs({
    build: { result: "success" },
    "secret-scan": { result: "success" },
    integration: { result: "success" }
  }, required), ["coverage-gate"]);
  assert.deepEqual(failedRequiredJobs(Object.fromEntries(
    required.map(job => [job, { result: "success" }])
  ), required), []);
});

test("sensitive review requires a current-head approval by a non-author human reviewer", () => {
  const approved = {
    user: { login: "reviewer", type: "User" },
    state: "APPROVED",
    commit_id: "head-sha",
    submitted_at: "2026-10-19T12:00:00Z",
    body: "Negative-path coverage: CONFIRMED"
  };
  assert.equal(hasIndependentNegativePathApproval([approved], "author", "head-sha"), true);
  assert.equal(hasIndependentNegativePathApproval([approved], "reviewer", "head-sha"), false);
  assert.equal(hasIndependentNegativePathApproval([
    { ...approved, commit_id: "old-sha" }
  ], "author", "head-sha"), false);
  assert.equal(hasIndependentNegativePathApproval([
    { ...approved, body: "Looks good" }
  ], "author", "head-sha"), false);
  assert.equal(hasIndependentNegativePathApproval([
    { ...approved, user: { login: "reviewer", type: "Bot" } }
  ], "author", "head-sha"), false);
  assert.equal(hasIndependentNegativePathApproval([
    approved,
    { ...approved, state: "CHANGES_REQUESTED", submitted_at: "2026-10-19T12:01:00Z" }
  ], "author", "head-sha"), false);
});

test("sensitive file matching covers auth, security, secrets, identity, and encryption paths", () => {
  for (const filename of [
    "src/Authentication/Token.cs",
    "src/SecurityCore/Policy.cs",
    "config/SecretsProvider.cs",
    "src/IdentityProvider/Provider.cs",
    "src/Encryption/Crypto.cs"
  ]) {
    assert.equal(isSensitiveFile(filename), true);
  }
  assert.equal(isSensitiveFile("src/Connectors/ErpConnector.cs"), false);
});

test("workflow reruns PR metadata validation on edits and reviews sensitive changes on review events", () => {
  const workflow = fs.readFileSync(
    path.join(__dirname, "../workflows/i2p-ci.yml"), "utf8"
  );
  assert.match(workflow, /types:\s*\[opened, synchronize, reopened, ready_for_review, edited\]/);
  assert.match(workflow, /pull_request_review:\s*\n\s+types:\s*\[submitted, edited, dismissed\]/);
  assert.match(workflow, /sha:\s*headSha[\s\S]*?context:\s*"all-checks"/);
});

test("policy ruleset targets only main and ppr and has no bypass actors", () => {
  const ruleset = JSON.parse(fs.readFileSync(
    path.join(__dirname, "../config/main-ppr-ruleset.json"), "utf8"
  ));
  assert.deepEqual(ruleset.conditions.ref_name.include, [
    "refs/heads/main",
    "refs/heads/ppr"
  ]);
  assert.deepEqual(ruleset.bypass_actors, []);
  assert.equal(ruleset.enforcement, "active");
  assert.equal(ruleset.rules.some(rule => rule.type === "update"), false);
  assert.equal(
    ruleset.rules.find(rule => rule.type === "required_status_checks")
      .parameters.required_status_checks[0].context,
    "all-checks"
  );
});
