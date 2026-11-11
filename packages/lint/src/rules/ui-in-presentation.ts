import { defineRule, type ESTree } from "@oxlint/plugins";

import { onImport } from "./imports.ts";
import { locate } from "./paths.ts";

const WEB_SOURCE = /\/apps\/web\/src\//;

const COMPOSITION_ROOT = /\/apps\/web\/src\/main\.tsx$/;

const UI_PACKAGE = /^(?:react|react-dom)(?:\/|$)|^@tanstack\//;

const mayImportUi = (filename: string): boolean =>
  !WEB_SOURCE.test(filename) ||
  COMPOSITION_ROOT.test(filename) ||
  locate(filename)?.layer === "presentation";

export const uiInPresentation = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Dans l'app web, React et TanStack ne s'importent que dans presentation et dans main.tsx (ADR 0044)",
    },
    messages: {
      jsxOutsidePresentation:
        "Le JSX ne s'écrit que dans la couche presentation d'un module ou dans main.tsx, la racine de composition (ADR 0044).",
      outsidePresentation:
        "{{source}} ne s'importe que dans la couche presentation d'un module ou dans main.tsx, la racine de composition (ADR 0044).",
    },
  },
  create(context) {
    if (mayImportUi(context.filename)) {
      return {};
    }
    const reportJsx = (node: ESTree.JSXElement | ESTree.JSXFragment) =>
      context.report({ node, messageId: "jsxOutsidePresentation" });
    return {
      ...onImport((source, node) => {
        if (UI_PACKAGE.test(source)) {
          context.report({ node, messageId: "outsidePresentation", data: { source } });
        }
      }),
      JSXElement: reportJsx,
      JSXFragment: reportJsx,
    };
  },
});
