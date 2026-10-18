import { readdir } from "node:fs/promises";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { checkOutputSchema } from "@repo/contracts";

const MODULES = new URL("./modules/", import.meta.url);

const contractFiles = async (): Promise<readonly URL[]> => {
  const entries = await readdir(MODULES, { recursive: true });
  return entries
    .filter((entry) => /^[^/]+\/contracts\/[^/]+\.ts$/.test(entry) && !entry.endsWith(".test.ts"))
    .map((entry) => new URL(entry, MODULES));
};

const outputSchemas = async (): Promise<readonly (readonly [string, z.ZodType])[]> => {
  const modules: readonly Readonly<Record<string, unknown>>[] = await Promise.all(
    (await contractFiles()).map((file) => import(file.href)),
  );
  return modules.flatMap((exports) =>
    Object.entries(exports).flatMap(([name, value]) =>
      name.endsWith("Output") && value instanceof z.ZodType ? [[name, value] as const] : [],
    ),
  );
};

const schemas = await outputSchemas();

describe("schémas de sortie des contracts/ des modules (ADR 0023 §4)", () => {
  it("en trouve au moins un", () => {
    expect(schemas.map(([name]) => name)).toContain("WhoamiOutput");
  });

  it.each(schemas)("%s respecte les conventions de sortie", (name, schema) => {
    expect(checkOutputSchema(name, schema)).toEqual([]);
  });
});
