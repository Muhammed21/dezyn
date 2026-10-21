import { aliasName } from "./reference.ts";

const FIELD_TYPES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  typography: {
    fontFamily: "fontFamily",
    fontSize: "dimension",
    fontWeight: "fontWeight",
    lineHeight: "number",
    letterSpacing: "dimension",
  },
  shadow: {
    color: "color",
    offsetX: "dimension",
    offsetY: "dimension",
    blur: "dimension",
    spread: "dimension",
  },
  gradient: {
    color: "color",
    position: "number",
  },
};

export type FieldAlias = {
  readonly field: string;
  readonly name: string;
  readonly $type: string;
};

const aliasesOfFields = (
  fieldTypes: Readonly<Record<string, string>>,
  value: object,
  prefix: string,
): readonly FieldAlias[] =>
  Object.entries(value).flatMap(([field, fieldValue]) => {
    const name = aliasName(fieldValue);
    const fieldType = fieldTypes[field];
    return name === undefined || fieldType === undefined
      ? []
      : [{ field: `${prefix}${field}`, name, $type: fieldType }];
  });

export const fieldAliases = ({
  $type,
  value,
}: {
  readonly $type: string;
  readonly value: unknown;
}): readonly FieldAlias[] => {
  const fieldTypes = FIELD_TYPES[$type];
  if (fieldTypes === undefined || typeof value !== "object" || value === null) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((layer: unknown, index) =>
      typeof layer === "object" && layer !== null
        ? aliasesOfFields(fieldTypes, layer, `${index}.`)
        : [],
    );
  }
  return aliasesOfFields(fieldTypes, value, "");
};

export const referencedNames = ({
  $type,
  $value,
  modes = {},
}: {
  readonly $type: string;
  readonly $value?: unknown;
  readonly modes?: Readonly<Record<string, unknown>>;
}): readonly string[] =>
  [$value, ...Object.values(modes)].flatMap((value) => {
    const name = aliasName(value);
    return name === undefined ? fieldAliases({ $type, value }).map((alias) => alias.name) : [name];
  });
