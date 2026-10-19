import { Hono } from "hono";
import { z } from "zod";

import { Uuid } from "@repo/contracts";

import type { AuthenticatedEnv } from "../../../platform/access-token.ts";
import { type Problem, problemResponse } from "../../../platform/problem.ts";
import { validate } from "../../../platform/validate.ts";
import type { TokenUseCases } from "../application/add-token.ts";
import { type ColorRefusal, colorRefusal, type SrgbColor } from "../domain/color.ts";
import type { ModeRefusal } from "../domain/mode-completeness.ts";
import { aliasName, type ReferenceRefusal } from "../domain/reference.ts";
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

const sentValues = <Value>({
  $value,
  modes = {},
}: {
  readonly $value?: Value | string;
  readonly modes?: Readonly<Record<string, Value | string>>;
}): readonly { readonly prefix: readonly string[]; readonly value: Value | string }[] => [
  ...($value === undefined ? [] : [{ prefix: ["$value"], value: $value }]),
  ...Object.entries(modes).map(([mode, value]) => ({ prefix: ["modes", mode], value })),
];

const issuesIn = <Value>(
  token: {
    readonly $value?: Value | string;
    readonly modes?: Readonly<Record<string, Value | string>>;
  },
  issuesOfValue: (value: Value) => readonly ValueIssue[],
): readonly ValueIssue[] =>
  sentValues(token).flatMap(({ prefix, value }) =>
    (typeof value === "string" ? [] : issuesOfValue(value)).map(({ path, message }) => ({
      path: [...prefix, ...path],
      message,
    })),
  );

const valueIssues = (token: TokenDefinition): readonly ValueIssue[] => {
  switch (token.$type) {
    case "color":
      return issuesIn(token, colorIssues);
    case "typography":
      return issuesIn(token, typographyIssues);
    case "shadow":
      return issuesIn(token, shadowIssues);
    default:
      return [];
  }
};

const MODE_ISSUES: Readonly<Record<ModeRefusal["refusal"], string>> = {
  missing_mode: "Valeur manquante pour ce mode",
  unknown_mode: "Mode inconnu du projet",
  value_without_mode: "Le projet a des modes : donner une valeur par mode dans modes",
  modes_without_modifier: "Le projet n'a pas de modes : donner $value",
  missing_value: "Valeur manquante",
};

const modeIssueOf = (refusal: ModeRefusal) => {
  if ("mode" in refusal) {
    return { path: `modes.${refusal.mode}`, message: MODE_ISSUES[refusal.refusal] };
  }
  return {
    path: refusal.refusal === "modes_without_modifier" ? "modes" : "$value",
    message: MODE_ISSUES[refusal.refusal],
  };
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

const ALIAS_FORMAT = "Référence attendue au format {nom.du.token}";

const aliasOr = <Item extends z.ZodType>(item: Item) =>
  z.unknown().transform((value, context): z.output<Item> | string => {
    if (typeof value === "string") {
      if (aliasName(value) === undefined) {
        context.addIssue({ code: "custom", message: ALIAS_FORMAT });
        return z.NEVER;
      }
      return value;
    }
    const parsed = item.safeParse(value);
    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => context.addIssue({ ...issue }));
      return z.NEVER;
    }
    return parsed.data;
  });

const typed = <Type extends string, Value extends z.ZodType>(type: Type, value: Value) =>
  z.strictObject({
    name: z.string(),
    $type: z.literal(type),
    $value: aliasOr(value).optional(),
    modes: z.record(z.string(), aliasOr(value)).optional(),
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
      context.addIssue({ code: "custom", path: [...path], message });
    });
  });

const REFERENCE_MESSAGES: Readonly<Record<ReferenceRefusal, string>> = {
  unknown_reference: "Référence vers un token inexistant",
  unvalidated_reference: "Référence vers un token non validé",
  type_mismatch: "Référence vers un token d'un autre type",
};

const referenceIssueOf = ({
  mode,
  refusal,
}: {
  readonly mode?: string;
  readonly refusal: ReferenceRefusal;
}) => ({
  path: mode === undefined ? "$value" : `modes.${mode}`,
  message: REFERENCE_MESSAGES[refusal],
});

const tokenOutputOf = ({ id, name, $type, $value, modes, $description, status }: Token) => ({
  id,
  name,
  $type,
  $value,
  modes,
  $description,
  status,
});

const invalidRequest = (errors: readonly { path: string; message: string }[]): Problem => ({
  type: "about:blank",
  title: "Requête invalide",
  status: 400,
  errors,
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
      if (added.error === "not_found") {
        return c.notFound();
      }
      if (added.error === "name_taken") {
        return problemResponse(
          c,
          invalidRequest([{ path: "name", message: "Nom déjà pris dans le projet" }]),
        );
      }
      if (added.error.code === "invalid_references") {
        return problemResponse(c, invalidRequest(added.error.refusals.map(referenceIssueOf)));
      }
      return problemResponse(c, invalidRequest(added.error.refusals.map(modeIssueOf)));
    },
  );
