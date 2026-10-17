import { execFile } from "node:child_process";
import { globSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const ROOT = new URL("../../../", import.meta.url).pathname;
const OXLINT = join(ROOT, "node_modules/.bin/oxlint");

type Override = { files: string[]; rules: Record<string, unknown> };
type OxlintConfig = {
  jsPlugins?: string[];
  rules: Record<string, unknown>;
  overrides: Override[];
};

const readConfig = (): OxlintConfig =>
  JSON.parse(readFileSync(join(ROOT, ".oxlintrc.json"), "utf8"));

const matches = (pattern: string) =>
  globSync(pattern, { cwd: ROOT, exclude: (path) => path.includes("node_modules") });

describe("le linter est linté (ADR 0020)", () => {
  it.each(readConfig().overrides.flatMap(({ files }) => files))(
    "le motif %s correspond à au moins un fichier",
    (pattern) => {
      expect(matches(pattern).length).toBeGreaterThan(0);
    },
  );

  it.each(readConfig().jsPlugins ?? [])("le plugin %s existe", (plugin) => {
    expect(matches(plugin)).toHaveLength(1);
  });

  it.each(["module-boundaries", "layer-dependencies", "no-disable-architecture"])(
    "la règle dezyn/%s est active en erreur",
    (rule) => {
      expect(readConfig().rules[`dezyn/${rule}`]).toBe("error");
    },
  );
});

const lintTree = async (files: Record<string, string>) => {
  const directory = await mkdtemp(join(tmpdir(), "architecture-"));
  const config = readConfig();
  await writeFile(
    join(directory, ".oxlintrc.json"),
    JSON.stringify({
      ...config,
      $schema: undefined,
      jsPlugins: (config.jsPlugins ?? []).map((plugin) => join(ROOT, plugin)),
    }),
  );
  await Promise.all(
    Object.entries(files).map(async ([path, code]) => {
      await mkdir(dirname(join(directory, path)), { recursive: true });
      await writeFile(join(directory, path), code);
    }),
  );
  return promisify(execFile)(OXLINT, ["-c", join(directory, ".oxlintrc.json"), directory]).then(
    ({ stdout }) => ({ code: 0, output: stdout }),
    (error: { code?: number; stdout?: string }) => ({
      code: error.code,
      output: error.stdout ?? "",
    }),
  );
};

const SPACE = "apps/api/src/modules/space";

describe("règles d'architecture, avec la vraie configuration", () => {
  it.each([
    [
      "un import vers l'intérieur d'un autre module",
      "apps/api/src/modules/project/domain/bad.ts",
      'import { a } from "../../space/application/create-space.ts";\nexport const b = a;\n',
      "dezyn(module-boundaries)",
    ],
    [
      "un domaine qui importe l'infrastructure de son module",
      `${SPACE}/domain/bad.ts`,
      'import { a } from "../infrastructure/space-repository.ts";\nexport const b = a;\n',
      "dezyn(layer-dependencies)",
    ],
    [
      "un commentaire de désactivation",
      `${SPACE}/domain/bad.ts`,
      "// oxlint-disable-next-line dezyn/layer-dependencies\nexport const a = 1;\n",
      "dezyn(no-disable-architecture)",
    ],
  ])("refuse %s", async (_name, path, code, rule) => {
    const { code: exitCode, output } = await lintTree({ [path]: code });

    expect(exitCode).toBe(1);
    expect(output).toContain(rule);
  });

  it("accepte un module conforme, et un import du contracts d'un autre module", async () => {
    const { code, output } = await lintTree({
      [`${SPACE}/domain/space-id.ts`]: "export const a = 1;\n",
      [`${SPACE}/contracts/events.ts`]:
        'import { a } from "../domain/space-id.ts";\nexport const b = a;\n',
      [`${SPACE}/application/create-space.ts`]:
        'import { a } from "../domain/space-id.ts";\nexport const b = a;\n',
      [`${SPACE}/presentation/routes.ts`]:
        'import { Hono } from "hono";\nimport { b } from "../application/create-space.ts";\nexport const c = [Hono, b];\n',
      ["apps/api/src/modules/project/application/on-space-created.ts"]:
        'import { b } from "../../space/contracts/events.ts";\nexport const c = b;\n',
    });

    expect(output).not.toMatch(/dezyn\(/);
    expect(code).toBe(0);
  });
});
