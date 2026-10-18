import { RuleTester } from "oxlint/plugins-dev";
import { describe, expect, it } from "vitest";

import plugin from "../index.ts";
import { layerDependencies } from "./layer-dependencies.ts";
import { moduleBoundaries } from "./module-boundaries.ts";
import { noDisableArchitecture } from "./no-disable-architecture.ts";
import { pureDomain } from "./pure-domain.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester();
const MODULES = "/repo/apps/api/src/modules";

describe("plugin dezyn", () => {
  it("expose ses trois règles sous le nom dezyn", () => {
    expect(plugin.meta?.name).toBe("dezyn");
    expect(Object.keys(plugin.rules).toSorted()).toEqual([
      "layer-dependencies",
      "module-boundaries",
      "no-disable-architecture",
      "pure-domain",
    ]);
  });

  it.each([
    ["module-boundaries", moduleBoundaries, "ADR 0020"],
    ["layer-dependencies", layerDependencies, "ADR 0020"],
    ["no-disable-architecture", noDisableArchitecture, "ADR 0020"],
    ["pure-domain", pureDomain, "ADR 0022"],
  ])("%s est un problème documenté qui cite son ADR", (_name, rule, adr) => {
    expect(rule.meta?.type).toBe("problem");
    expect(rule.meta?.docs?.description).toContain(adr);
  });
});

tester.run("module-boundaries (message)", moduleBoundaries, {
  valid: [],
  invalid: [
    {
      filename: `${MODULES}/project/domain/x.ts`,
      code: 'import { a } from "../../space/domain/space-id.ts";',
      errors: [
        {
          message:
            "Le module project importe l'intérieur du module space : passer par space/contracts/ (ADR 0020).",
        },
      ],
    },
  ],
});

tester.run("layer-dependencies (message)", layerDependencies, {
  valid: [],
  invalid: [
    {
      filename: `${MODULES}/space/domain/x.ts`,
      code: 'import { a } from "../application/y.ts";',
      errors: [
        {
          message:
            "La couche domain n'importe pas application : presentation et infrastructure → application → domain, presentation → contracts → domain (ADR 0020, ADR 0022).",
        },
      ],
    },
  ],
});

tester.run("no-disable-architecture (message)", noDisableArchitecture, {
  valid: [],
  invalid: [
    {
      code: "// oxlint-disable-next-line dezyn/module-boundaries\nconst a = 1;",
      errors: [
        {
          message:
            "Une règle d'architecture ne se désactive pas par commentaire : changer la règle dans packages/lint, en revue critical (ADR 0020).",
        },
      ],
    },
  ],
});
