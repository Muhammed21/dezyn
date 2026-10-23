import { describe, expect, it } from "vitest";

import { defaultToNativeForLoopback } from "./client-registration.ts";

const makeRegistration = (overrides: Record<string, unknown> = {}) => ({
  client_name: "Claude Code",
  redirect_uris: ["http://localhost:33418/callback"],
  ...overrides,
});

describe("defaultToNativeForLoopback", () => {
  it.each([
    "http://localhost:33418/callback",
    "http://127.0.0.1:33418/callback",
    "http://[::1]:33418/callback",
  ])("déclare native un client sans type dont la redirection est la boucle locale %s", (uri) => {
    expect(defaultToNativeForLoopback(makeRegistration({ redirect_uris: [uri] }))).toEqual(
      makeRegistration({ redirect_uris: [uri], application_type: "native" }),
    );
  });

  it("garde le type déclaré par le client", () => {
    const registration = makeRegistration({ application_type: "web" });

    expect(defaultToNativeForLoopback(registration)).toEqual(registration);
  });

  it.each([
    ["une redirection https", ["https://app.example.com/callback"]],
    ["une redirection http hors de la boucle locale", ["http://app.example.com/callback"]],
    ["une redirection locale en https", ["https://localhost:33418/callback"]],
    [
      "une redirection locale et une redirection distante",
      ["http://localhost:33418/callback", "https://app.example.com/cb"],
    ],
    ["aucune redirection", []],
    ["une redirection qui n'est pas une URL", ["pas une url"]],
  ])("ne change rien pour %s", (_case, redirectUris) => {
    const registration = makeRegistration({ redirect_uris: redirectUris });

    expect(defaultToNativeForLoopback(registration)).toEqual(registration);
  });

  it.each([
    ["sans redirect_uris", { client_name: "Claude Code" }],
    ["avec des redirect_uris qui ne sont pas des chaînes", { redirect_uris: [42] }],
    [
      "avec une redirection locale enfermée dans un tableau",
      { redirect_uris: [["http://localhost:33418/callback"]] },
    ],
    ["qui n'est pas un objet", "texte"],
    ["null", null],
  ])("ne change rien à un corps %s", (_case, body) => {
    expect(defaultToNativeForLoopback(body)).toEqual(body);
  });
});
