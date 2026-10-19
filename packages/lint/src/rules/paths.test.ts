import { describe, expect, it } from "vitest";

import { isInternalImport, locate, locateImport } from "./paths.ts";

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

describe("locateImport, par les alias de apps/api", () => {
  const importer = `${MODULES}/project/application/create-project.ts`;

  it.each([
    ["#modules/space/contracts/events.ts", { module: "space", layer: "contracts" }],
    ["#modules/project/domain/project.ts", { module: "project", layer: "domain" }],
  ])("situe l'alias %s comme le chemin qu'il désigne", (source, location) => {
    expect(locateImport(importer, source)).toEqual(location);
  });

  it.each(["#platform/clock.ts", "#testing/project-fixtures.ts", "#db", "#create-app"])(
    "ne situe dans aucun module l'alias %s, hors des modules",
    (source) => {
      expect(locateImport(importer, source)).toBeUndefined();
    },
  );

  it.each([
    "../domain/project.ts",
    "#modules/space/contracts/events.ts",
    "#platform/clock.ts",
    "#db",
  ])("reconnaît %s comme un import interne de apps/api, et pas comme un paquet", (source) => {
    expect(isInternalImport(importer, source)).toBe(true);
  });

  it.each(["zod", "@repo/db", "#inconnu/x.ts", "#dbx", "#create-apps"])(
    "ne prend pas %s pour un import interne",
    (source) => {
      expect(isInternalImport(importer, source)).toBe(false);
    },
  );

  it("ne prend pas un alias de apps/api pour un import interne hors de apps/api", () => {
    expect(isInternalImport("/repo/packages/db/src/index.ts", "#platform/clock.ts")).toBe(false);
  });

  it("ignore un alias hors de apps/api", () => {
    expect(
      locateImport("/repo/packages/db/src/index.ts", "#modules/space/contracts/events.ts"),
    ).toBeUndefined();
  });
});
