/** @type {import("@stryker-mutator/api/core").PartialStrykerOptions} */
export default {
  testRunner: "vitest",
  plugins: ["@stryker-mutator/vitest-runner"],
  vitest: { configFile: "vitest.browser.config.ts" },
  coverageAnalysis: "perTest",
  concurrency: 1,
  reporters: ["clear-text", "progress", "html"],
  htmlReporter: { fileName: "reports/mutation-ui/index.html" },
  mutate: ["src/modules/*/presentation/**/*.tsx", "!src/**/*.test.tsx"],
  tsconfigFile: "stryker-skips-tsconfig-rewrite.json",
  thresholds: { high: 100, low: 90, break: null },
};
