import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";

import { layerDependencies } from "../layer-dependencies.ts";
import { moduleBoundaries } from "../module-boundaries.ts";
import { pureDomain } from "../pure-domain.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester();

const MODULES = "/repo/apps/web/src/modules";

const inModule = (module: string, path: string) => `${MODULES}/${module}/${path}`;

tester.run("module-boundaries dans l'app web (ADR 0044 §6)", moduleBoundaries, {
  valid: [
    {
      name: "import interne au module",
      filename: inModule("space", "application/list-my-spaces.ts"),
      code: 'import { Space } from "../domain/space.ts";',
    },
  ],
  invalid: [
    {
      name: "import de l'intérieur d'un autre module",
      filename: inModule("space", "presentation/use-my-spaces.ts"),
      code: 'import { currentSession } from "../../identity/application/current-session.ts";',
      errors: [{ messageId: "crossModule", data: { from: "space", to: "identity" } }],
    },
  ],
});

const WEB_LAYERS: readonly (readonly [string, readonly string[]])[] = [
  ["domain", ["domain"]],
  ["application", ["domain", "application"]],
  ["infrastructure", ["domain", "application", "infrastructure"]],
  ["presentation", ["domain", "application", "presentation"]],
];

const LAYERS = ["domain", "application", "infrastructure", "presentation"];

tester.run("layer-dependencies dans l'app web (ADR 0044 §6)", layerDependencies, {
  valid: WEB_LAYERS.flatMap(([from, allowed]) =>
    allowed.map((to) => ({
      name: `${from} importe ${to}`,
      filename: inModule("space", `${from}/file.ts`),
      code: `import { a } from "../${to}/other.ts";`,
    })),
  ),
  invalid: WEB_LAYERS.flatMap(([from, allowed]) =>
    LAYERS.filter((to) => !allowed.includes(to)).map((to) => ({
      name: `${from} n'importe pas ${to}`,
      filename: inModule("space", `${from}/file.ts`),
      code: `import { a } from "../${to}/other.ts";`,
      errors: [{ messageId: "forbiddenLayer", data: { from, to } }],
    })),
  ),
});

tester.run("pure-domain dans l'app web (ADR 0044 §6)", pureDomain, {
  valid: [
    {
      name: "le domaine importe son propre domaine",
      filename: inModule("space", "domain/space.ts"),
      code: 'import { Role } from "./role.ts";',
    },
  ],
  invalid: [
    ...["@repo/contracts", "zod", "react"].map((source) => ({
      name: `le domaine n'importe pas ${source}`,
      filename: inModule("space", "domain/space.ts"),
      code: `import { a } from "${source}";`,
      errors: [{ messageId: "package", data: { layer: "domain", source } }],
    })),
    {
      name: "le domaine n'importe pas la plateforme",
      filename: inModule("space", "domain/space.ts"),
      code: 'import { http } from "../../../platform/http.ts";',
      errors: [
        {
          messageId: "outsideModules",
          data: { layer: "domain", source: "../../../platform/http.ts" },
        },
      ],
    },
  ],
});
