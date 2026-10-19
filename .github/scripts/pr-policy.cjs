const protectedBranches = new Set(["main", "ppr", "dev"]);
const requiredPullRequestJobs = [
  "build",
  "pr-metadata",
  "promotion-check",
  "secret-scan",
  "platform-tests",
  "coverage-gate",
  "connector-contract-tests",
  "integration",
  "dependency-scan"
];

function hasRequirementReference(body) {
  return /\b(?:FR|NFR)-[A-Z]{2,6}-\d{2,4}\b/.test(body || "");
}

function isAllowedPromotion({ headRepo, baseRepo, headRef, baseRef }) {
  if (!headRepo || headRepo !== baseRepo) return false;

  if (baseRef === "dev") {
    return !protectedBranches.has(headRef);
  }

  return (baseRef === "ppr" && headRef === "dev") ||
    (baseRef === "main" && headRef === "ppr");
}

function isSensitiveFile(filename) {
  return /auth|security|secrets?|identity|encrypt/i.test(filename);
}

function hasIndependentNegativePathApproval(reviews, author, headSha) {
  const latestByReviewer = new Map();

  for (const review of reviews) {
    const login = review.user?.login;
    if (!login || login.toLowerCase() === (author || "").toLowerCase() ||
        review.user?.type === "Bot") continue;

    const previous = latestByReviewer.get(login);
    if (!previous || new Date(review.submitted_at) > new Date(previous.submitted_at)) {
      latestByReviewer.set(login, review);
    }
  }

  return [...latestByReviewer.values()].some(review =>
    review.state === "APPROVED" &&
    review.commit_id === headSha &&
    /negative-path coverage:\s*confirmed/i.test(review.body || "")
  );
}

function failedRequiredJobs(needs, requiredJobs) {
  return requiredJobs.filter(job => needs[job]?.result !== "success");
}

module.exports = {
  failedRequiredJobs,
  hasIndependentNegativePathApproval,
  hasRequirementReference,
  isAllowedPromotion,
  isSensitiveFile,
  requiredPullRequestJobs
};
