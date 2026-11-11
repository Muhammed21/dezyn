import { describe, expect, it } from "vitest";

import {
  ADA,
  BASE_URL,
  makeClientIp,
  signUp,
  withIdentityApp,
} from "@repo/api/testing/authorization-flow.ts";
import { err, ok } from "@repo/result";

import { makeApiBrowser } from "../../../testing/api-browser.ts";
import { createSpaces } from "../space-module.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("espaces du membre dans l'app web, contre la vraie API (ADR 0044 §6)", () => {
  it("un membre connecté retrouve son espace personnel", () =>
    withIdentityApp(async (app) => {
      const ip = makeClientIp();
      await signUp(app, ip);
      const fetch = makeApiBrowser(app, { ip });
      await fetch(`${BASE_URL}/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: ADA.email, password: ADA.password }),
      });

      const spaces = await createSpaces({ apiUrl: BASE_URL, fetch }).listMySpaces();

      expect(spaces).toEqual(
        ok([{ id: expect.stringMatching(UUID), name: ADA.name, plan: "free", role: "owner" }]),
      );
    }));

  it("sans session, la liste donne unauthenticated", () =>
    withIdentityApp(async (app) => {
      const fetch = makeApiBrowser(app, { ip: makeClientIp() });

      expect(await createSpaces({ apiUrl: BASE_URL, fetch }).listMySpaces()).toEqual(
        err("unauthenticated"),
      );
    }));
});
