import { defineRule } from "@oxlint/plugins";

import { onImport } from "./imports.ts";
import { locate, locateImport } from "./paths.ts";

const ALLOWED_PACKAGES: Readonly<Record<string, readonly string[]>> = {
  domain: [],
  contracts: ["zod"],
};

const isRelative = (source: string): boolean => source.startsWith("./") || source.startsWith("../");

const isAllowed = (source: string, packages: readonly string[]): boolean =>
  packages.some((name) => source === name || source.startsWith(`${name}/`));

export const pureDomain = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "domain/ n'importe aucun paquet ni rien hors des modules, contracts/ seulement zod (ADR 0020, ADR 0022)",
    },
    messages: {
      package:
        "La couche {{layer}} n'importe pas le paquet {{source}} : le domaine est pur, et contracts/ n'importe que zod (ADR 0020, ADR 0022).",
      outsideModules:
        "La couche {{layer}} n'importe pas {{source}}, hors des modules : le domaine est pur, et contracts/ n'importe que zod (ADR 0020, ADR 0022).",
    },
  },
  create(context) {
    const layer = locate(context.filename)?.layer ?? "";
    const allowed = ALLOWED_PACKAGES[layer];
    if (allowed === undefined) {
      return {};
    }
    return onImport((source, node) => {
      if (!isRelative(source)) {
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
