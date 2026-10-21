import { STATUS_CODES } from "node:http";

import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { AppEnv } from "./http.ts";
import { InvalidRequest } from "./validate.ts";

export type Problem = {
  readonly type: string;
  readonly title: string;
  readonly status: ContentfulStatusCode;
  readonly errors?: readonly { readonly path: string; readonly message: string }[];
  readonly extensions?: Readonly<Record<string, string | number>>;
};

export const INTERNAL_ERROR: Problem = {
  type: "about:blank",
  title: "Erreur interne",
  status: 500,
};

export const FORBIDDEN: Problem = {
  type: "about:blank",
  title: "Accès refusé",
  status: 403,
};

export const invalidRequest = (errors: NonNullable<Problem["errors"]>): Problem => ({
  type: "about:blank",
  title: "Requête invalide",
  status: 400,
  errors,
});

export const clientProblem = (error: Error): Problem | undefined => {
  if (error instanceof InvalidRequest) {
    return invalidRequest(
      error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    );
  }
  if (error instanceof HTTPException && error.status < 500) {
    return {
      type: "about:blank",
      title: STATUS_CODES[error.status] ?? "Erreur",
      status: error.status,
    };
  }
  return undefined;
};

const withoutExtensions = ({ extensions: _extensions, ...problem }: Problem) => problem;

export const problemResponse = <E extends AppEnv>(c: Context<E>, problem: Problem): Response =>
  c.body(
    JSON.stringify({
      ...withoutExtensions(problem),
      ...problem.extensions,
      instance: c.req.path,
      correlationId: c.get("correlationId"),
    }),
    problem.status,
    { "content-type": "application/problem+json" },
  );
