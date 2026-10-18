import { Hono } from "hono";
import { z } from "zod";

import { Uuid } from "@repo/contracts";

import type { AuthenticatedEnv } from "../../../platform/access-token.ts";
import { problemResponse } from "../../../platform/problem.ts";
import { validate } from "../../../platform/validate.ts";
import type { TokenUseCases } from "../application/add-token.ts";
import { type ColorRefusal, colorRefusal, type SrgbColor } from "../domain/color.ts";
import { type Shadow, type ShadowRefusal, shadowRefusals } from "../domain/shadow.ts";
import { type TokenNameRefusal, tokenNameRefusal } from "../domain/token-name.ts";
import type { Token, TokenDefinition } from "../domain/token.ts";
import {
  FONT_WEIGHT_KEYWORDS,
  type Typography,
  type TypographyRefusal,
  typographyRefusal,
} from "../domain/typography.ts";

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

const TYPOGRAPHY_ISSUES: Readonly<Record<TypographyRefusal, { field: string; message: string }>> = {
  font_weight_out_of_range: {
    field: "fontWeight",
    message: "Graisse hors de l'intervalle 1 à 1000",
  },
  empty_font_family: { field: "fontFamily", message: "Famille de police vide" },
};

type ValueIssue = { readonly path: readonly (string | number)[]; readonly message: string };

const issuesOf = <Refusal extends string>(
  refusal: Refusal | undefined,
  issues: Readonly<Record<Refusal, { readonly field: string; readonly message: string }>>,
): readonly ValueIssue[] => {
  if (refusal === undefined) {
    return [];
  }
  const { field, message } = issues[refusal];
  return [{ path: [field], message }];
};

const colorIssues = (color: SrgbColor) => issuesOf(colorRefusal(color), COLOR_ISSUES);

const typographyIssues = (typography: Typography) =>
  issuesOf(typographyRefusal(typography), TYPOGRAPHY_ISSUES);

const shadowIssueOf = (refusal: ShadowRefusal): ValueIssue => {
  switch (refusal) {
    case "no_layer":
      return { path: [], message: "Ombre sans couche" };
    case "negative_blur":
      return { path: ["blur"], message: "Flou négatif" };
    default:
      return {
        path: ["color", COLOR_ISSUES[refusal].field],
        message: COLOR_ISSUES[refusal].message,
      };
  }
};

const shadowIssues = (shadow: Shadow): readonly ValueIssue[] =>
  shadowRefusals(shadow).map(({ layer, refusal }) => {
    const { path, message } = shadowIssueOf(refusal);
    return { path: layer === undefined ? path : [layer, ...path], message };
  });

const valueIssues = (token: TokenDefinition): readonly ValueIssue[] => {
  switch (token.$type) {
    case "color":
      return colorIssues(token.$value);
    case "typography":
      return typographyIssues(token.$value);
    case "shadow":
      return shadowIssues(token.$value);
    default:
      return [];
  }
};

const DimensionRequest = z.strictObject({
  value: z.number(),
  unit: z.enum(["px", "rem"]),
});

const TypographyRequest = z.strictObject({
  fontFamily: z.union([z.string(), z.array(z.string())]),
  fontSize: DimensionRequest,
  fontWeight: z.union([z.number(), z.enum(FONT_WEIGHT_KEYWORDS)]),
  lineHeight: z.number(),
  letterSpacing: DimensionRequest,
});

const ShadowLayerRequest = z.strictObject({
  color: SrgbColorRequest,
  offsetX: DimensionRequest,
  offsetY: DimensionRequest,
  blur: DimensionRequest,
  spread: DimensionRequest,
  inset: z.boolean().optional(),
});

const oneOrMany = <Item extends z.ZodType>(item: Item) => {
  const many = z.array(item);
  return z.unknown().transform((value, context): z.output<Item> | z.output<typeof many> => {
    const parsed = (Array.isArray(value) ? many : item).safeParse(value);
    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => context.addIssue({ ...issue }));
      return z.NEVER;
    }
    return parsed.data;
  });
};

const ShadowRequest = oneOrMany(ShadowLayerRequest);

const typed = <Type extends string, Value extends z.ZodType>(type: Type, value: Value) =>
  z.strictObject({
    name: z.string(),
    $type: z.literal(type),
    $value: value,
    $description: z.string().optional(),
  });

const TokenRequest = z
  .discriminatedUnion("$type", [
    typed("color", SrgbColorRequest),
    typed("dimension", DimensionRequest),
    typed("typography", TypographyRequest),
    typed("shadow", ShadowRequest),
  ])
  .superRefine((token, context) => {
    const nameRefusal = tokenNameRefusal(token.name);
    if (nameRefusal !== undefined) {
      context.addIssue({ code: "custom", path: ["name"], message: NAME_MESSAGES[nameRefusal] });
    }
    valueIssues(token).forEach(({ path, message }) => {
      context.addIssue({ code: "custom", path: ["$value", ...path], message });
    });
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
