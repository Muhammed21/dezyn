import { z } from "zod";

export type ConventionViolation = {
  readonly rule: "closed-object" | "bare-enum" | "missing-fallback" | "unsupported";
  readonly path: string;
  readonly message: string;
};

const EXPLANATIONS: Record<ConventionViolation["rule"], string> = {
  "closed-object": "un objet de sortie s'écrit z.looseObject (ADR 0023 §1)",
  "bare-enum": "un enum de sortie passe par openEnum (ADR 0023 §2)",
  "missing-fallback":
    "une union de sortie se termine par une variante de repli, ou porte .meta({ closed: true }) (ADR 0023 §3)",
  unsupported:
    "type de schéma que le garde ne sait pas vérifier, à lui apprendre avant de l'exporter (ADR 0023 §4)",
};

const violation = (rule: ConventionViolation["rule"], path: string): ConventionViolation => ({
  rule,
  path,
  message: `${path} : ${EXPLANATIONS[rule]}`,
});

const isOpen = (schema: z.ZodObject): boolean => schema.def.catchall instanceof z.ZodUnknown;

const isOpenEnum = (schema: z.ZodUnion): boolean =>
  schema.options.length === 2 &&
  schema.options[0] instanceof z.ZodEnum &&
  schema.options[1] instanceof z.ZodString;

const isFallback = (schema: unknown): boolean => {
  if (!(schema instanceof z.ZodObject) || !isOpen(schema)) {
    return false;
  }
  const fields = Object.values(schema.shape);
  return fields.length === 1 && fields[0] instanceof z.ZodString;
};

const isClosedByChoice = (schema: z.ZodUnion): boolean =>
  z.globalRegistry.get(schema)?.["closed"] === true;

const LEAVES = new Set(["string", "number", "boolean", "literal", "null", "unknown"]);

const walk = (
  schema: unknown,
  path: string,
  seen: ReadonlySet<unknown>,
): readonly ConventionViolation[] => {
  if (
    schema instanceof z.ZodOptional ||
    schema instanceof z.ZodNullable ||
    schema instanceof z.ZodReadonly ||
    schema instanceof z.ZodDefault ||
    schema instanceof z.ZodCatch
  ) {
    return walk(schema.def.innerType, path, seen);
  }
  if (schema instanceof z.ZodLazy) {
    return seen.has(schema) ? [] : walk(schema.def.getter(), path, new Set([...seen, schema]));
  }
  if (schema instanceof z.ZodPipe) {
    return [...walk(schema.def.in, path, seen), ...walk(schema.def.out, path, seen)];
  }
  if (schema instanceof z.ZodIntersection) {
    return [
      ...walk(schema.def.left, `${path}&0`, seen),
      ...walk(schema.def.right, `${path}&1`, seen),
    ];
  }
  if (schema instanceof z.ZodObject) {
    if (seen.has(schema)) {
      return [];
    }
    const inside = new Set([...seen, schema]);
    return [
      ...(isOpen(schema) ? [] : [violation("closed-object", path)]),
      ...Object.entries(schema.shape).flatMap(([key, field]) =>
        walk(field, `${path}.${key}`, inside),
      ),
    ];
  }
  if (schema instanceof z.ZodArray) {
    return walk(schema.element, `${path}[]`, seen);
  }
  if (schema instanceof z.ZodRecord) {
    return [
      ...walk(schema.def.keyType, `${path}{key}`, seen),
      ...walk(schema.def.valueType, `${path}{}`, seen),
    ];
  }
  if (schema instanceof z.ZodTuple) {
    return [
      ...schema.def.items.flatMap((item, index) => walk(item, `${path}[${index}]`, seen)),
      ...(schema.def.rest === null ? [] : walk(schema.def.rest, `${path}[...]`, seen)),
    ];
  }
  if (schema instanceof z.ZodEnum) {
    return [violation("bare-enum", path)];
  }
  if (schema instanceof z.ZodUnion) {
    if (isOpenEnum(schema)) {
      return [];
    }
    const options: readonly unknown[] = schema.options;
    return [
      ...(isClosedByChoice(schema) || isFallback(options.at(-1))
        ? []
        : [violation("missing-fallback", path)]),
      ...options.flatMap((option, index) => walk(option, `${path}<${index}>`, seen)),
    ];
  }
  return schema instanceof z.ZodType && LEAVES.has(schema.def.type)
    ? []
    : [violation("unsupported", path)];
};

export const checkOutputSchema = (
  name: string,
  schema: z.ZodType,
): readonly ConventionViolation[] => walk(schema, name, new Set());
