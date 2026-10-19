import { defineRule } from "@oxlint/plugins";

import { onImport } from "./imports.ts";
import { isInternalImport, locate, locateImport } from "./paths.ts";

const ALLOWED_PACKAGES: Readonly<Record<string, readonly string[]>> = {
  domain: [],
  contracts: ["zod", "@repo/contracts"],
};

const TEST_PACKAGES: readonly string[] = ["vitest"];

const isTest = (filename: string): boolean => filename.endsWith(".test.ts");

const isAllowed = (source: string, packages: readonly string[]): boolean =>
  packages.some((name) => source === name || source.startsWith(`${name}/`));

export const pureDomain = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "domain/ n'importe aucun paquet ni rien hors des modules, contracts/ seulement zod et @repo/contracts (ADR 0020, ADR 0022, ADR 0023)",
    },
    messages: {
      package:
        "La couche {{layer}} n'importe pas le paquet {{source}} : le domaine est pur, et contracts/ n'importe que zod et @repo/contracts (ADR 0020, ADR 0022, ADR 0023).",
      outsideModules:
        "La couche {{layer}} n'importe pas {{source}}, hors des modules : le domaine est pur, et contracts/ n'importe que zod et @repo/contracts (ADR 0020, ADR 0022, ADR 0023).",
    },
  },
  create(context) {
    const layer = locate(context.filename)?.layer ?? "";
    const layerPackages = ALLOWED_PACKAGES[layer];
    if (layerPackages === undefined) {
      return {};
    }
    const allowed = isTest(context.filename) ? [...layerPackages, ...TEST_PACKAGES] : layerPackages;
    return onImport((source, node) => {
      if (!isInternalImport(context.filename, source)) {
        if (!isAllowed(source, allowed)) {
          context.report({ node, messageId: "package", data: { layer, source } });
        }
        return;
      }
      if (locateImport(context.filename, source) === undefined) {
        context.report({ node, messageId: "outsideModules", data: { layer, source } });
      }
    });
  },
});
