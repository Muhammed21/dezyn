import { Hono } from "hono";
import { z } from "zod";

import { Uuid } from "@repo/contracts";

import type { AuthenticatedEnv } from "../../../platform/access-token.ts";
import { problemResponse } from "../../../platform/problem.ts";
import { validate } from "../../../platform/validate.ts";
import type { TokenUseCases } from "../application/add-token.ts";
import { type ColorRefusal, colorRefusal } from "../domain/color.ts";
import { type TokenNameRefusal, tokenNameRefusal } from "../domain/token-name.ts";
import type { Token } from "../domain/token.ts";

const SrgbColorRequest = z.strictObject({
  colorSpace: z.literal("srgb"),
  components: z.tuple([z.number(), z.number(), z.number()]),
  alpha: z.number().optional(),
  hex: z.string().optional(),
});

const NAME_MESSAGES: Readonly<Record<TokenNameRefusal, string>> = {
  empty_segment: "Segment de nom vide",
  dollar_prefix: "Segment de nom commençant par $",
  brace: "Accolade interdite dans un nom",
};

const COLOR_ISSUES: Readonly<Record<ColorRefusal, { field: string; message: string }>> = {
  component_out_of_range: {
    field: "components",
    message: "Composante hors de l'intervalle 0 à 1",
  },
  alpha_out_of_range: { field: "alpha", message: "Alpha hors de l'intervalle 0 à 1" },
  malformed_hex: { field: "hex", message: "Hex attendu au format #rrggbb" },
  hex_mismatch: { field: "hex", message: "Hex différent des composantes" },
};

const TokenRequest = z
  .strictObject({
    name: z.string(),
    $type: z.literal("color"),
    $value: SrgbColorRequest,
    $description: z.string().optional(),
  })
  .superRefine((token, context) => {
    const nameRefusal = tokenNameRefusal(token.name);
    if (nameRefusal !== undefined) {
      context.addIssue({ code: "custom", path: ["name"], message: NAME_MESSAGES[nameRefusal] });
    }
    const valueRefusal = colorRefusal(token.$value);
    if (valueRefusal !== undefined) {
      const { field, message } = COLOR_ISSUES[valueRefusal];
      context.addIssue({ code: "custom", path: ["$value", field], message });
    }
  });

const tokenOutputOf = ({ id, name, $type, $value, $description, status }: Token) => ({
  id,
  name,
  $type,
  $value,
  $description,
  status,
});

export const tokensRoutes = ({ addToken }: TokenUseCases) =>
  new Hono<AuthenticatedEnv>().post(
    "/:projectId/tokens",
    validate("json", TokenRequest),
    async (c) => {
      const projectId = Uuid.safeParse(c.req.param("projectId")).data;
      if (projectId === undefined) {
        return c.notFound();
      }
      const added = await addToken({
        projectId,
        userId: c.get("identity").userId,
        token: c.req.valid("json"),
        correlationId: c.get("correlationId"),
      });
      if (added.ok) {
        return c.json(tokenOutputOf(added.value), 201);
      }
      return added.error === "not_found"
        ? c.notFound()
        : problemResponse(c, {
            type: "about:blank",
            title: "Requête invalide",
            status: 400,
            errors: [{ path: "name", message: "Nom déjà pris dans le projet" }],
          });
    },
  );
