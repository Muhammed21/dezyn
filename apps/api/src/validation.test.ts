import { describe, expect, it } from "vitest";
import { z } from "zod";

import { validate } from "#platform/validate.ts";
import { makeApp } from "#testing/make-app.ts";

const makeAppWithValidatedRoute = () => {
  const made = makeApp();
  made.app.post(
    "/projets",
    validate(
      "json",
      z.object({ name: z.string(), modes: z.int().min(1), brand: z.object({ name: z.string() }) }),
    ),
    (c) => c.json(c.req.valid("json"), 201),
  );
  return made;
};

const postProject = (body: unknown) =>
  makeAppWithValidatedRoute().app.request("/projets?brouillon=1", {
    method: "POST",
    headers: { "content-type": "application/json", "x-correlation-id": "validation-1" },
    body: JSON.stringify(body),
  });

describe("validation des entrées", () => {
  it("laisse passer une entrée valide jusqu'à la route", async () => {
    const response = await postProject({ name: "Healthcare", modes: 2, brand: { name: "Acme" } });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      name: "Healthcare",
      modes: 2,
      brand: { name: "Acme" },
    });
  });

  it("répond 400 en problem+json avec la liste des champs en erreur", async () => {
    const response = await postProject({ name: 42, modes: 0, brand: {} });

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(await response.json()).toEqual({
      type: "about:blank",
      title: "Requête invalide",
      status: 400,
      instance: "/projets",
      correlationId: "validation-1",
      errors: [
        { path: "name", message: expect.any(String) },
        { path: "modes", message: expect.any(String) },
        { path: "brand.name", message: expect.any(String) },
      ],
    });
  });

  it("ne laisse pas de log d'erreur pour une requête invalide", async () => {
    const { app, records } = makeAppWithValidatedRoute();

    await app.request("/projets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });

    expect(records.filter((record) => record.level === "error")).toEqual([]);
  });

  it("répond 400 en problem+json à un corps JSON mal formé, sans log d'erreur", async () => {
    const { app, records } = makeAppWithValidatedRoute();

    const response = await app.request("/projets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ name:",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      type: "about:blank",
      title: "Bad Request",
      status: 400,
    });
    expect(records.filter((record) => record.level === "error")).toEqual([]);
  });
});
