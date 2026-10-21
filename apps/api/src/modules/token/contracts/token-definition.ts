import { z } from "zod";

import { type ColorRefusal, colorRefusal, type SrgbColor } from "../domain/color.ts";
import { type Gradient, type GradientRefusal, gradientRefusals } from "../domain/gradient.ts";
import { pendingTypeOf } from "../domain/pending-type.ts";
import { type Alias, isReference } from "../domain/reference.ts";
import { type Shadow, type ShadowRefusal, shadowRefusals } from "../domain/shadow.ts";
import { type TokenNameRefusal, tokenNameRefusal } from "../domain/token-name.ts";
import type { TokenDefinition } from "../domain/token.ts";
import {
  FONT_WEIGHT_KEYWORDS,
  type FontFamily,
  fontFamilyRefusal,
  type FontWeight,
  fontWeightRefusal,
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

const fieldlessIssuesOf = (refusal: TypographyRefusal | undefined): readonly ValueIssue[] =>
  refusal === undefined ? [] : [{ path: [], message: TYPOGRAPHY_ISSUES[refusal].message }];

const fontFamilyIssues = (fontFamily: FontFamily) =>
  fieldlessIssuesOf(fontFamilyRefusal(fontFamily));

const fontWeightIssues = (fontWeight: FontWeight) =>
  fieldlessIssuesOf(fontWeightRefusal(fontWeight));

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

const gradientIssueOf = (refusal: GradientRefusal): ValueIssue => {
  switch (refusal) {
    case "no_stop":
      return { path: [], message: "Dégradé sans arrêt" };
    case "position_out_of_range":
      return { path: ["position"], message: "Position hors de l'intervalle 0 à 1" };
    default:
      return {
        path: ["color", COLOR_ISSUES[refusal].field],
        message: COLOR_ISSUES[refusal].message,
      };
  }
};

const gradientIssues = (gradient: Gradient): readonly ValueIssue[] =>
  gradientRefusals(gradient).map(({ stop, refusal }) => {
    const { path, message } = gradientIssueOf(refusal);
    return { path: stop === undefined ? path : [stop, ...path], message };
  });

const sentValues = <Value>({
  $value,
  modes = {},
}: {
  readonly $value?: Value | Alias;
  readonly modes?: Readonly<Record<string, Value | Alias>>;
}): readonly { readonly prefix: readonly string[]; readonly value: Value | Alias }[] => [
  ...($value === undefined ? [] : [{ prefix: ["$value"], value: $value }]),
  ...Object.entries(modes).map(([mode, value]) => ({ prefix: ["modes", mode], value })),
];

const issuesIn = <Value>(
  token: {
    readonly $value?: Value | Alias;
    readonly modes?: Readonly<Record<string, Value | Alias>>;
  },
  issuesOfValue: (value: Value) => readonly ValueIssue[],
): readonly ValueIssue[] =>
  sentValues(token).flatMap(({ prefix, value }) =>
    (isReference(value) ? [] : issuesOfValue(value)).map(({ path, message }) => ({
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
    case "gradient":
      return issuesIn(token, gradientIssues);
    case "fontFamily":
      return issuesIn(token, fontFamilyIssues);
    case "fontWeight":
      return issuesIn(token, fontWeightIssues);
    default:
      return [];
  }
};

const ALIAS_FORMAT = "Référence attendue au format {nom.du.token}";

const FONT_WEIGHT_MESSAGE = "Mot-clé de graisse inconnu";

const NUMBER_MESSAGE = "Nombre attendu";

const aliasOr = <Item extends z.ZodType>(item: Item, unbracedMessage: string) =>
  z.unknown().transform((value, context): z.output<Item> | Alias => {
    if (isReference(value)) {
      return value;
    }
    const parsed = item.safeParse(value);
    if (!parsed.success) {
      if (typeof value === "string") {
        context.addIssue({
          code: "custom",
          message: value.startsWith("{") ? ALIAS_FORMAT : unbracedMessage,
        });
        return z.NEVER;
      }
      parsed.error.issues.forEach((issue) => context.addIssue({ ...issue }));
      return z.NEVER;
    }
    return parsed.data;
  });

const DimensionRequest = z.strictObject({
  value: z.number(),
  unit: z.enum(["px", "rem"]),
});

const FontFamilyRequest = z.union([z.string(), z.array(z.string())]);

const FontWeightRequest = z.union([z.number(), z.enum(FONT_WEIGHT_KEYWORDS)]);

const TypographyRequest = z.strictObject({
  fontFamily: FontFamilyRequest,
  fontSize: aliasOr(DimensionRequest, ALIAS_FORMAT),
  fontWeight: aliasOr(FontWeightRequest, FONT_WEIGHT_MESSAGE),
  lineHeight: aliasOr(z.number(), NUMBER_MESSAGE),
  letterSpacing: aliasOr(DimensionRequest, ALIAS_FORMAT),
});

const ShadowLayerRequest = z.strictObject({
  color: aliasOr(SrgbColorRequest, ALIAS_FORMAT),
  offsetX: aliasOr(DimensionRequest, ALIAS_FORMAT),
  offsetY: aliasOr(DimensionRequest, ALIAS_FORMAT),
  blur: aliasOr(DimensionRequest, ALIAS_FORMAT),
  spread: aliasOr(DimensionRequest, ALIAS_FORMAT),
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

const GradientRequest = z.array(
  z.strictObject({
    color: SrgbColorRequest,
    position: z.number(),
  }),
);

const typed = <Type extends string, Value extends z.ZodType>(
  type: Type,
  value: Value,
  unbracedMessage = ALIAS_FORMAT,
) =>
  z.strictObject({
    name: z.string(),
    $type: z.literal(type),
    $value: aliasOr(value, unbracedMessage).optional(),
    modes: z.record(z.string(), aliasOr(value, unbracedMessage)).optional(),
    $description: z.string().optional(),
  });

const typeOf = (input: unknown): unknown =>
  typeof input === "object" && input !== null && "$type" in input ? input.$type : undefined;

const pendingTypeMessage = ({ input }: { readonly input?: unknown }): string | undefined => {
  const pending = pendingTypeOf(typeOf(input));
  return pending === undefined ? undefined : `Le type ${pending} n'est pas encore pris en charge`;
};

export const TokenDefinitionInput = z
  .discriminatedUnion(
    "$type",
    [
      typed("color", SrgbColorRequest),
      typed("dimension", DimensionRequest),
      typed("typography", TypographyRequest),
      typed("shadow", ShadowRequest),
      typed("gradient", GradientRequest),
      typed("fontFamily", FontFamilyRequest),
      typed("fontWeight", FontWeightRequest, FONT_WEIGHT_MESSAGE),
      typed("number", z.number(), NUMBER_MESSAGE),
    ],
    { error: pendingTypeMessage },
  )
  .superRefine((token, context) => {
    const nameRefusal = tokenNameRefusal(token.name);
    if (nameRefusal !== undefined) {
      context.addIssue({ code: "custom", path: ["name"], message: NAME_MESSAGES[nameRefusal] });
    }
    valueIssues(token).forEach(({ path, message }) => {
      context.addIssue({ code: "custom", path: [...path], message });
    });
  });
export const parseTokenDefinition = (
  candidate: Readonly<Record<string, unknown>>,
):
  | { readonly definition: TokenDefinition }
  | { readonly issues: readonly { readonly path: string; readonly message: string }[] } => {
  const parsed = TokenDefinitionInput.safeParse(candidate);
  return parsed.success
    ? { definition: parsed.data }
    : {
        issues: parsed.error.issues.map(({ path, message }) => ({
          path: path.map(String).join("."),
          message,
        })),
      };
};

export type { TokenDefinition } from "../domain/token.ts";
export { type ComparedDefinition, sameDefinition } from "../domain/same-definition.ts";
export { referencedNames } from "../domain/field-references.ts";
