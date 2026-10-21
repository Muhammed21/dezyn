import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

import { defineConfig } from "vitest/config";

const ROOT_ENV = new URL("../../.env", import.meta.url);

export default defineConfig({
  test: {
    env: existsSync(ROOT_ENV) ? parseEnv(readFileSync(ROOT_ENV, "utf8")) : {},
    fileParallelism: false,
    benchmark: { include: ["bench/**/*.bench.ts"] },
  },
});
