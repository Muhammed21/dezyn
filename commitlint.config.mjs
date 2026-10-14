const surfaces = ["web", "api", "mcp", "ui", "adr", "docs", "infra", "ci", "deps", "tooling"];

export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum": [2, "always", surfaces],
    "subject-case": [0],
  },
};
