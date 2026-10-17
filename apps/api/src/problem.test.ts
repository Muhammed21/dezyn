import { HTTPException } from "hono/http-exception";
import { describe, expect, it } from "vitest";

import { makeApp } from "./testing/make-app.ts";

describe("erreurs au format problem+json", () => {
  it("une route inconnue répond 404, avec le chemin sans la query", async () => {
    const { app } = makeApp();

    const response = await app.request("/inconnue?page=2");

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(await response.json()).toEqual({
      type: "about:blank",
      title: "Ressource introuvable",
      status: 404,
      instance: "/inconnue",
      correlationId: response.headers.get("x-correlation-id"),
    });
  });

  it("une erreur inattendue répond 500 sans détail et laisse un log d'erreur avec l'identifiant de corrélation", async () => {
    const { app, records } = makeApp();
    app.get("/panne", () => {
      throw new Error("mot de passe de la base : hunter2");
    });

    const response = await app.request("/panne", { headers: { "x-correlation-id": "panne-1" } });

    expect(response.status).toBe(500);
    expect(response.headers.get("x-correlation-id")).toBe("panne-1");
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(await response.json()).toEqual({
      type: "about:blank",
      title: "Erreur interne",
      status: 500,
      instance: "/panne",
      correlationId: "panne-1",
    });
    expect(records).toContainEqual(
      expect.objectContaining({
        level: "error",
        msg: "unhandled",
        correlationId: "panne-1",
        error: "mot de passe de la base : hunter2",
      }),
    );
  });

  it("une exception HTTP 500 reste une erreur interne, loguée", async () => {
    const { app, records } = makeApp();
    app.get("/panne-http", () => {
      throw new HTTPException(500, { message: "détail interne" });
    });

    const response = await app.request("/panne-http");

    expect(await response.json()).toMatchObject({ title: "Erreur interne", status: 500 });
    expect(records).toContainEqual(
      expect.objectContaining({ level: "error", error: "détail interne" }),
    );
  });
});
