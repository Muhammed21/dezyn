import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";

import { layerDependencies } from "./layer-dependencies.ts";
import { moduleBoundaries } from "./module-boundaries.ts";
import { noDisableArchitecture } from "./no-disable-architecture.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester();

const MODULES = "/repo/apps/api/src/modules";

const inModule = (module: string, path: string) => `${MODULES}/${module}/${path}`;

tester.run("module-boundaries", moduleBoundaries, {
  valid: [
    {
      name: "import interne au module",
      filename: inModule("project", "application/create-project.ts"),
      code: 'import { Project } from "../domain/project.ts";',
    },
    {
      name: "import du dossier contracts d'un autre module",
      filename: inModule("project", "application/on-space-created.ts"),
      code: 'import type { SpaceCreated } from "../../space/contracts/events.ts";',
    },
    {
      name: "import d'un package",
      filename: inModule("project", "domain/project.ts"),
      code: 'import { ok } from "zod";',
    },
    {
      name: "export sans source",
      filename: inModule("project", "domain/project.ts"),
      code: "export const channel = 1;",
    },
    {
      name: "import dynamique non littéral",
      filename: inModule("project", "infrastructure/loader.ts"),
      code: "const load = (path) => import(path);",
    },
    {
      name: "import dynamique d'un littéral qui n'est pas une chaîne",
      filename: inModule("project", "infrastructure/loader.ts"),
      code: "const load = () => import(42);",
    },
    {
      name: "fichier hors des modules",
      filename: "/repo/apps/api/src/app.module.ts",
      code: 'import { SpaceModule } from "./modules/space/space.module.ts";',
    },
  ],
  invalid: [
    {
      name: "import par alias du domaine d'un autre module",
      filename: inModule("project", "application/create-project.ts"),
      code: 'import { SpaceId } from "#modules/space/domain/space-id.ts";',
      errors: [{ messageId: "crossModule", data: { from: "project", to: "space" } }],
    },
    {
      name: "import du domaine d'un autre module",
      filename: inModule("project", "application/create-project.ts"),
      code: 'import { SpaceId } from "../../space/domain/space-id.ts";',
      errors: [{ messageId: "crossModule", data: { from: "project", to: "space" } }],
    },
    {
      name: "réexport depuis un autre module",
      filename: inModule("project", "domain/index.ts"),
      code: 'export * from "../../space/domain/space-id.ts";',
      errors: [{ messageId: "crossModule" }],
    },
    {
      name: "réexport nommé depuis un autre module",
      filename: inModule("project", "domain/index.ts"),
      code: 'export { SpaceId } from "../../space/domain/space-id.ts";',
      errors: [{ messageId: "crossModule" }],
    },
    {
      name: "import dynamique d'un autre module",
      filename: inModule("project", "infrastructure/loader.ts"),
      code: 'const load = () => import("../../space/space.module.ts");',
      errors: [{ messageId: "crossModule" }],
    },
  ],
});

tester.run("layer-dependencies", layerDependencies, {
  valid: [
    ...[
      ["domain", "domain"],
      ["application", "domain"],
      ["application", "application"],
      ["infrastructure", "application"],
      ["infrastructure", "domain"],
      ["presentation", "application"],
      ["presentation", "domain"],
      ["contracts", "domain"],
      ["infrastructure", "infrastructure"],
      ["presentation", "presentation"],
      ["contracts", "contracts"],
      ["presentation", "contracts"],
    ].map(([from, to]) => ({
      name: `${from} importe ${to}`,
      filename: inModule("space", `${from}/file.ts`),
      code: `import { x } from "../${to}/other.ts";`,
    })),
    {
      name: "import vers un autre module, laissé à module-boundaries",
      filename: inModule("space", "domain/file.ts"),
      code: 'import { x } from "../../project/application/other.ts";',
    },
    {
      name: "dossier du module qui n'est pas une couche",
      filename: inModule("space", "testing/factories.ts"),
      code: 'import { x } from "../infrastructure/other.ts";',
    },
    {
      name: "la racine du module importe toutes les couches",
      filename: inModule("space", "space.module.ts"),
      code: 'import { Controller } from "./presentation/me.controller.ts";',
    },
    {
      name: "import d'un package depuis le domaine",
      filename: inModule("space", "domain/space-id.ts"),
      code: 'import { ok } from "zod";',
    },
    {
      name: "fichier hors des modules",
      filename: "/repo/apps/api/src/platform/problem.ts",
      code: 'import { x } from "../modules/space/infrastructure/x.ts";',
    },
  ],
  invalid: [
    ...[
      ["domain", "application"],
      ["domain", "infrastructure"],
      ["application", "infrastructure"],
      ["application", "presentation"],
      ["infrastructure", "presentation"],
      ["presentation", "infrastructure"],
      ["contracts", "application"],
      ["domain", "contracts"],
      ["infrastructure", "contracts"],
    ].map(([from, to]) => ({
      name: `${from} n'importe pas ${to}`,
      filename: inModule("space", `${from}/file.ts`),
      code: `import { x } from "../${to}/other.ts";`,
      errors: [{ messageId: "forbiddenLayer", data: { from, to } }],
    })),
    {
      name: "par alias, le domaine n'importe pas l'application de son module",
      filename: inModule("space", "domain/space-id.ts"),
      code: 'import { x } from "#modules/space/application/other.ts";',
      errors: [{ messageId: "forbiddenLayer", data: { from: "domain", to: "application" } }],
    },
    {
      name: "le domaine n'importe pas la racine du module",
      filename: inModule("space", "domain/space-id.ts"),
      code: 'import { SpaceModule } from "../space.module.ts";',
      errors: [{ messageId: "forbiddenLayer", data: { from: "domain", to: "racine du module" } }],
    },
  ],
});

const ARCHITECTURE_DISABLES = [
  "// oxlint-disable",
  "/*eslint-disable*/",
  "// oxlint-disable-next-line dezyn/module-boundaries",
  "// eslint-disable-line dezyn/layer-dependencies",
  "/* oxlint-disable dezyn/module-boundaries */",
  "/* eslint-disable */",
  "// oxlint-disable-next-line no-console, dezyn/layer-dependencies",
];

tester.run("no-disable-architecture", noDisableArchitecture, {
  valid: [
    {
      name: "désactivation d'une règle ordinaire",
      code: "// oxlint-disable-next-line no-console\nconsole.log(1);",
    },
    {
      name: "directive citée au milieu d'un commentaire",
      code: "// voir oxlint-disable dezyn/module-boundaries plus haut\nconst a = 1;",
    },
    {
      name: "mot qui commence comme une directive",
      code: "// eslint-disabled par défaut\nconst a = 1;",
    },
    {
      name: "désactivation d'une règle au nom proche",
      code: "// oxlint-disable-next-line no-restricted-imports-extra, dezyn-like/rule\nconst a = 1;",
    },
    {
      name: "commentaire ordinaire",
      code: "// la règle dezyn/module-boundaries protège ceci\nconst a = 1;",
    },
  ],
  invalid: ARCHITECTURE_DISABLES.map((comment) => ({
    name: comment,
    code: `${comment}\nconst a = 1;`,
    errors: [{ messageId: "disabled" }],
  })),
});
