import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";

import { uiInPresentation } from "../ui-in-presentation.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester();

const WEB = "/repo/apps/web/src";

const UI_PACKAGES = [
  "react",
  "react/jsx-runtime",
  "react-dom",
  "react-dom/client",
  "@tanstack/react-query",
  "@tanstack/react-router",
];

tester.run("ui-in-presentation (ADR 0044 §6)", uiInPresentation, {
  valid: [
    ...UI_PACKAGES.map((source) => ({
      name: `la présentation importe ${source}`,
      filename: `${WEB}/modules/space/presentation/my-spaces.tsx`,
      code: `import { a } from "${source}";`,
    })),
    {
      name: "un test de la présentation importe React",
      filename: `${WEB}/modules/space/presentation/__tests__/my-spaces.test.tsx`,
      code: 'import { useState } from "react";',
    },
    {
      name: "la racine de composition importe React DOM",
      filename: `${WEB}/main.tsx`,
      code: 'import { createRoot } from "react-dom/client";',
    },
    {
      name: "l'infrastructure importe un paquet qui n'est pas d'interface",
      filename: `${WEB}/modules/space/infrastructure/http-space-gateway.ts`,
      code: 'import { MySpacesOutput } from "@repo/contracts";',
    },
    {
      name: "un paquet dont le nom commence par react",
      filename: `${WEB}/modules/space/application/list-my-spaces.ts`,
      code: 'import { a } from "react-is-not-react";',
    },
    {
      name: "un fichier local rangé sous un dossier @tanstack",
      filename: `${WEB}/modules/space/application/list-my-spaces.ts`,
      code: 'import { a } from "./vendor/@tanstack/query.ts";',
    },
    {
      name: "un fichier de l'API",
      filename: "/repo/apps/api/src/modules/space/domain/space.ts",
      code: 'import { useState } from "react";',
    },
    {
      name: "un fichier d'un autre paquet",
      filename: "/repo/packages/ui/src/button.tsx",
      code: 'import { useState } from "react";',
    },
  ],
  invalid: [
    ...["domain", "application", "infrastructure"].flatMap((layer) =>
      UI_PACKAGES.map((source) => ({
        name: `la couche ${layer} n'importe pas ${source}`,
        filename: `${WEB}/modules/space/${layer}/file.ts`,
        code: `import { a } from "${source}";`,
        errors: [{ messageId: "outsidePresentation", data: { source } }],
      })),
    ),
    {
      name: "la plateforme n'importe pas React",
      filename: `${WEB}/platform/http.ts`,
      code: 'import { useState } from "react";',
      errors: [{ messageId: "outsidePresentation", data: { source: "react" } }],
    },
    {
      name: "un autre fichier à la racine n'importe pas TanStack",
      filename: `${WEB}/router.tsx`,
      code: 'import { createRouter } from "@tanstack/react-router";',
      errors: [{ messageId: "outsidePresentation", data: { source: "@tanstack/react-router" } }],
    },
    {
      name: "un fichier dont le nom commence par main.tsx n'est pas la racine de composition",
      filename: `${WEB}/main.tsx-ancien.tsx`,
      code: 'import { useState } from "react";',
      errors: [{ messageId: "outsidePresentation", data: { source: "react" } }],
    },
    {
      name: "un fichier à la racine d'un module n'importe pas React",
      filename: `${WEB}/modules/space/space-module.ts`,
      code: 'import { useState } from "react";',
      errors: [{ messageId: "outsidePresentation", data: { source: "react" } }],
    },
    {
      name: "un import dynamique de React hors présentation",
      filename: `${WEB}/modules/space/application/list-my-spaces.ts`,
      code: 'const load = () => import("react");',
      errors: [{ messageId: "outsidePresentation", data: { source: "react" } }],
    },
  ],
});
