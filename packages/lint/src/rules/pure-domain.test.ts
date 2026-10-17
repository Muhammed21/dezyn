import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";

import { pureDomain } from "./pure-domain.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester();

const MODULES = "/repo/apps/api/src/modules";

const inModule = (module: string, path: string) => `${MODULES}/${module}/${path}`;

tester.run("pure-domain", pureDomain, {
  valid: [
    {
      name: "le domaine importe son propre domaine",
      filename: inModule("space", "domain/space.ts"),
      code: 'import { SpaceId } from "./space-id.ts";',
    },
    {
      name: "le contrat importe zod",
      filename: inModule("space", "contracts/schemas.ts"),
      code: 'import { z } from "zod";',
    },
    {
      name: "le contrat importe un sous-chemin de zod",
      filename: inModule("space", "contracts/schemas.ts"),
      code: 'import { z } from "zod/v4";',
    },
    {
      name: "le contrat importe le domaine de son module",
      filename: inModule("space", "contracts/events.ts"),
      code: 'import type { SpaceId } from "../domain/space-id.ts";',
    },
    {
      name: "l'infrastructure importe un paquet",
      filename: inModule("space", "infrastructure/space-repository.ts"),
      code: 'import { drizzle } from "drizzle-orm/node-postgres";',
    },
    {
      name: "la présentation importe Hono",
      filename: inModule("space", "presentation/routes.ts"),
      code: 'import { Hono } from "hono";',
    },
    {
      name: "fichier hors des modules",
      filename: "/repo/apps/api/src/platform/postgres-database.ts",
      code: 'import { Pool } from "pg";',
    },
    {
      name: "export sans source",
      filename: inModule("space", "domain/space.ts"),
      code: "export const space = 1;",
    },
  ],
  invalid: [
    ...[
      "hono",
      "drizzle-orm/node-postgres",
      "pg",
      "@repo/db",
      "@hono/node-server",
      "zod",
      "node:crypto",
    ].map((source) => ({
      name: `le domaine importe ${source}`,
      filename: inModule("space", "domain/space.ts"),
      code: `import { x } from "${source}";`,
      errors: [{ messageId: "package", data: { layer: "domain", source } }],
    })),
    {
      name: "le contrat importe Hono",
      filename: inModule("space", "contracts/schemas.ts"),
      code: 'import { Hono } from "hono";',
      errors: [{ messageId: "package", data: { layer: "contracts", source: "hono" } }],
    },
    {
      name: "le contrat importe un paquet au nom proche de zod",
      filename: inModule("space", "contracts/schemas.ts"),
      code: 'import { x } from "zod-to-json-schema";',
      errors: [
        { messageId: "package", data: { layer: "contracts", source: "zod-to-json-schema" } },
      ],
    },
    {
      name: "le domaine importe un type d'un paquet",
      filename: inModule("space", "domain/space.ts"),
      code: 'import type { Context } from "hono";',
      errors: [{ messageId: "package" }],
    },
    {
      name: "le domaine sort des modules vers platform/",
      filename: inModule("space", "domain/space.ts"),
      code: 'import { createPostgresDatabase } from "../../../platform/postgres-database.ts";',
      errors: [
        {
          messageId: "outsideModules",
          data: { layer: "domain", source: "../../../platform/postgres-database.ts" },
        },
      ],
    },
    {
      name: "le contrat sort des modules",
      filename: inModule("space", "contracts/schemas.ts"),
      code: 'import { x } from "../../../create-app.ts";',
      errors: [
        {
          messageId: "outsideModules",
          data: { layer: "contracts", source: "../../../create-app.ts" },
        },
      ],
    },
  ],
});

tester.run("pure-domain (messages)", pureDomain, {
  valid: [],
  invalid: [
    {
      filename: inModule("space", "domain/space.ts"),
      code: 'import { Hono } from "hono";',
      errors: [
        {
          message:
            "La couche domain n'importe pas le paquet hono : le domaine est pur, et contracts/ n'importe que zod (ADR 0020, ADR 0022).",
        },
      ],
    },
    {
      filename: inModule("space", "domain/space.ts"),
      code: 'import { a } from "../../../platform/problem.ts";',
      errors: [
        {
          message:
            "La couche domain n'importe pas ../../../platform/problem.ts, hors des modules : le domaine est pur, et contracts/ n'importe que zod (ADR 0020, ADR 0022).",
        },
      ],
    },
  ],
});
