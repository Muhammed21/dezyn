import { mkdir, readFile, writeFile } from "node:fs/promises";

import { latestMigration } from "../src/schema-version/latest-migration.ts";

const JOURNAL = new URL("../migrations/meta/_journal.json", import.meta.url);
const OUTPUT_DIRECTORY = new URL("../src/generated/", import.meta.url);

const latest = latestMigration(JSON.parse(await readFile(JOURNAL, "utf8")));

await mkdir(OUTPUT_DIRECTORY, { recursive: true });
await writeFile(
  new URL("latest-migration.ts", OUTPUT_DIRECTORY),
  `export const LATEST_MIGRATION = { tag: ${JSON.stringify(latest.tag)}, when: ${latest.when} };\n`,
);
