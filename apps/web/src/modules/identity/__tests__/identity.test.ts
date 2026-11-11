import { describe, expect, it } from "vitest";

import { err, ok } from "@repo/result";

import { createIdentity } from "../identity-module.ts";

const API_URL = "https://api.dezyn.dev";

const CREDENTIALS = { email: "ada@dezyn.test", password: "un-mot-de-passe-solide" };

const ADA_USER = {
  id: "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
  email: "ada@dezyn.test",
  name: "Ada Lovelace",
};

type Call = { readonly url: string; readonly init: RequestInit };

const answering = (response: () => Response) => {
  const calls: Call[] = [];
  const fetch = (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(response());
  };
  return { identity: createIdentity({ apiUrl: API_URL, fetch }), calls };
};

const json =
  (body: unknown, status = 200) =>
  () =>
    Response.json(body, { status });

const unreachable = () =>
  createIdentity({
    apiUrl: API_URL,
    fetch: () => Promise.reject(new TypeError("Failed to fetch")),
  });

describe("connexion d'un membre depuis l'app web (ADR 0044 §7)", () => {
  it("envoie les identifiants à better-auth avec le cookie du navigateur", async () => {
    const { identity, calls } = answering(json({ token: "jeton", user: ADA_USER }));

    await identity.signIn(CREDENTIALS);

    expect(calls).toEqual([
      {
        url: `${API_URL}/auth/sign-in/email`,
        init: {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(CREDENTIALS),
        },
      },
    ]);
  });

  it("donne la session du membre, sans le jeton que renvoie better-auth", async () => {
    const { identity } = answering(json({ redirect: false, token: "jeton", user: ADA_USER }));

    expect(await identity.signIn(CREDENTIALS)).toEqual(
      ok({ userId: ADA_USER.id, email: ADA_USER.email }),
    );
  });

  it("donne invalid_credentials sur un refus 401", async () => {
    const { identity } = answering(json({ code: "INVALID_EMAIL_OR_PASSWORD" }, 401));

    expect(await identity.signIn(CREDENTIALS)).toEqual(err("invalid_credentials"));
  });

  it("donne rate_limited quand la limite de débit de better-auth refuse la tentative", async () => {
    const { identity } = answering(json({ message: "Too many requests" }, 429));

    expect(await identity.signIn(CREDENTIALS)).toEqual(err("rate_limited"));
  });

  it("donne unavailable quand l'API est injoignable", async () => {
    expect(await unreachable().signIn(CREDENTIALS)).toEqual(err("unavailable"));
  });

  it.each([500, 503])("donne unavailable sur une réponse %i", async (status) => {
    const { identity } = answering(json({}, status));

    expect(await identity.signIn(CREDENTIALS)).toEqual(err("unavailable"));
  });

  it.each([
    ["un utilisateur sans identifiant", json({ user: { email: ADA_USER.email } })],
    ["un utilisateur sans email", json({ user: { id: ADA_USER.id } })],
    ["un corps qui n'est pas du JSON", () => new Response("<html>", { status: 200 })],
    ["un refus 400", json({ code: "VALIDATION_ERROR" }, 400)],
    ["un statut 499", json({}, 499)],
  ])("donne invalid_response sur %s", async (_case, response) => {
    const { identity } = answering(response);

    expect(await identity.signIn(CREDENTIALS)).toEqual(err("invalid_response"));
  });
});

describe("session courante du navigateur (ADR 0044 §7)", () => {
  it("demande la session à better-auth avec le cookie du navigateur", async () => {
    const { identity, calls } = answering(json(null));

    await identity.currentSession();

    expect(calls).toEqual([
      { url: `${API_URL}/auth/get-session`, init: { method: "GET", credentials: "include" } },
    ]);
  });

  it("donne la session du membre connecté, sans le jeton de session", async () => {
    const { identity } = answering(
      json({ session: { token: "jeton", userId: ADA_USER.id }, user: ADA_USER }),
    );

    expect(await identity.currentSession()).toEqual(
      ok({ userId: ADA_USER.id, email: ADA_USER.email }),
    );
  });

  it("ne donne aucune session quand better-auth répond null", async () => {
    const { identity } = answering(json(null));

    expect(await identity.currentSession()).toEqual(ok(undefined));
  });

  it("donne unavailable quand l'API est injoignable", async () => {
    expect(await unreachable().currentSession()).toEqual(err("unavailable"));
  });

  it.each([500, 429])("donne unavailable sur une réponse %i", async (status) => {
    const { identity } = answering(json({}, status));

    expect(await identity.currentSession()).toEqual(err("unavailable"));
  });

  it.each([
    ["un utilisateur sans email", json({ user: { id: ADA_USER.id } })],
    ["un corps qui n'est pas du JSON", () => new Response("<html>", { status: 200 })],
    ["un refus 401", json({}, 401)],
  ])("donne invalid_response sur %s", async (_case, response) => {
    const { identity } = answering(response);

    expect(await identity.currentSession()).toEqual(err("invalid_response"));
  });
});

const SIGN_UP = {
  name: "Ada Lovelace",
  email: "ada@dezyn.test",
  password: "un-mot-de-passe-solide",
};

const refusedBy = (status: number, code: string) =>
  json({ code, message: "Refus de better-auth" }, status);

describe("inscription d'un visiteur depuis l'app web (ADR 0044 §7)", () => {
  it("envoie le nom rogné, l'email et le mot de passe à better-auth avec le cookie du navigateur", async () => {
    const { identity, calls } = answering(json({ token: "jeton", user: ADA_USER }));

    await identity.signUp({ ...SIGN_UP, name: "  Ada Lovelace  " });

    expect(calls).toEqual([
      {
        url: `${API_URL}/auth/sign-up/email`,
        init: {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(SIGN_UP),
        },
      },
    ]);
  });

  it("donne la session du nouveau membre, sans le jeton que renvoie better-auth", async () => {
    const { identity } = answering(json({ token: "jeton", user: ADA_USER }));

    expect(await identity.signUp(SIGN_UP)).toEqual(
      ok({ userId: ADA_USER.id, email: ADA_USER.email }),
    );
  });

  it.each(["", "   "])("donne invalid_name pour le nom %j, sans appeler l'API", async (name) => {
    const { identity, calls } = answering(json({ token: "jeton", user: ADA_USER }));

    expect(await identity.signUp({ ...SIGN_UP, name })).toEqual(err("invalid_name"));
    expect(calls).toEqual([]);
  });

  it.each(["ada-sans-arobase", "ada@", ""])(
    "donne invalid_email pour l'email %j, sans appeler l'API",
    async (email) => {
      const { identity, calls } = answering(json({ token: "jeton", user: ADA_USER }));

      expect(await identity.signUp({ ...SIGN_UP, email })).toEqual(err("invalid_email"));
      expect(calls).toEqual([]);
    },
  );

  it.each([
    ["un email déjà pris", refusedBy(422, "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"), "email_taken"],
    ["un email invalide", refusedBy(400, "INVALID_EMAIL"), "invalid_email"],
    ["un mot de passe trop court", refusedBy(400, "PASSWORD_TOO_SHORT"), "invalid_password"],
    ["un mot de passe trop long", refusedBy(400, "PASSWORD_TOO_LONG"), "invalid_password"],
    ["un autre refus 400", refusedBy(400, "VALIDATION_ERROR"), "invalid_response"],
    ["un 400 sans code", json({ message: "Refus" }, 400), "invalid_response"],
    ["un 400 dont le code est hérité d'Object", refusedBy(400, "toString"), "invalid_response"],
    ["trop de tentatives", refusedBy(429, "TOO_MANY_REQUESTS"), "rate_limited"],
    ["une panne de l'API", refusedBy(500, "INTERNAL_SERVER_ERROR"), "unavailable"],
    ["une API indisponible", refusedBy(503, "SERVICE_UNAVAILABLE"), "unavailable"],
    ["un corps sans membre", json({ token: "jeton" }), "invalid_response"],
    [
      "un corps qui n'est pas du JSON",
      () => new Response("<html>", { status: 200 }),
      "invalid_response",
    ],
  ])("donne sur %s l'échec attendu", async (_case, response, failure) => {
    const { identity } = answering(response);

    expect(await identity.signUp(SIGN_UP)).toEqual(err(failure));
  });

  it("donne unavailable quand l'API est injoignable", async () => {
    expect(await unreachable().signUp(SIGN_UP)).toEqual(err("unavailable"));
  });
});
