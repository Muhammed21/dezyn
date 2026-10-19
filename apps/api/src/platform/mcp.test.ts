import { describe, expect, it } from "vitest";

import { makeApp, makeAuth } from "#testing/make-app.ts";
import { err } from "@repo/result";

const RESOURCE_METADATA = "http://127.0.0.1:3000/.well-known/oauth-protected-resource/v1";

const callMcpWith = (failure: "invalid_token" | "revoked" | "unavailable") => {
  const { app } = makeApp({
    auth: makeAuth({ verifyAccessToken: () => Promise.resolve(err(failure)) }),
  });
  return app.request("http://127.0.0.1:3000/v1/mcp", {
    method: "POST",
    headers: { authorization: "Bearer un-jeton", "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
};

describe("POST /v1/mcp : traduction des refus du vérificateur", () => {
  it("une session révoquée répond 401 invalid_token", async () => {
    const response = await callMcpWith("revoked");

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      `Bearer error="invalid_token", resource_metadata="${RESOURCE_METADATA}"`,
    );
  });

  it("des sessions illisibles répondent 503 problem+json, sans demander de réauthentification", async () => {
    const response = await callMcpWith("unavailable");

    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(response.headers.get("www-authenticate")).toBeNull();
    expect(await response.json()).toMatchObject({
      type: "about:blank",
      title: "Service indisponible",
      status: 503,
    });
  });
});
