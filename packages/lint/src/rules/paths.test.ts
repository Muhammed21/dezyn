import { describe, expect, it } from "vitest";

import { locate, locateImport } from "./paths.ts";

const MODULES = "/repo/apps/api/src/modules";

describe("locate", () => {
  it.each([
    [`${MODULES}/space/domain/space-id.ts`, { module: "space", layer: "domain" }],
    [`${MODULES}/space/space.module.ts`, { module: "space", layer: undefined }],
    [
      `${MODULES}/space/presentation/http/me.controller.ts`,
      { module: "space", layer: "presentation" },
    ],
  ])("situe %s", (path, location) => {
    expect(locate(path)).toEqual(location);
  });

  it.each([
    "/repo/apps/api/src/platform/problem.ts",
    "/repo/packages/db/src/index.ts",
    `${MODULES}/`,
  ])("ne situe pas %s", (path) => {
    expect(locate(path)).toBeUndefined();
  });
});

describe("locateImport", () => {
  const importer = `${MODULES}/project/application/create-project.ts`;

  it.each([
    ["../domain/project.ts", { module: "project", layer: "domain" }],
    ["./use-case.ts", { module: "project", layer: "application" }],
    ["../../space/contracts/events.ts", { module: "space", layer: "contracts" }],
  ])("situe l'import relatif %s", (source, location) => {
    expect(locateImport(importer, source)).toEqual(location);
  });

  it.each(["@repo/db", "hono", "zod", "node:path", "project/domain/x.ts", ".hidden/x.ts"])(
    "ignore l'import non relatif %s",
    (source) => {
      expect(locateImport(importer, source)).toBeUndefined();
    },
  );
});
