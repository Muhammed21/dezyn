import type { ValidationTargets } from "hono";
import { validator } from "hono/validator";
import type { z } from "zod";

export class InvalidRequest extends Error {
  readonly issues: readonly z.core.$ZodIssue[];

  constructor(issues: readonly z.core.$ZodIssue[]) {
    super("Requête invalide");
    this.issues = issues;
  }
}

export const validate = <Schema extends z.ZodType>(
  target: keyof ValidationTargets,
  schema: Schema,
) =>
  validator(target, (value): z.output<Schema> => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      throw new InvalidRequest(parsed.error.issues);
    }
    return parsed.data;
  });
