import { describe, expect, it } from "vitest";

import { configOf } from "../config.ts";

const API_URL = "http://127.0.0.1:3000";
const WEB_URL = "http://127.0.0.1:5173";

const makeEnv = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  VITE_API_URL: API_URL,
  VITE_WEB_URL: WEB_URL,
  ...overrides,
});

const DEV = { dev: true };
const PRODUCTION = { dev: false };

describe("configuration de l'app web au démarrage", () => {
  it("donne l'URL de l'API quand la page est servie depuis l'origine de WEB_URL", () => {
    expect(configOf({ env: makeEnv(), href: `${WEB_URL}/espaces`, ...DEV })).toEqual({
      kind: "ready",
      apiUrl: API_URL,
    });
  });

  it.each([
    ["absente", undefined],
    ["vide", ""],
    ["qui n'est pas une URL", "api-locale"],
    ["qui n'est pas en http(s)", "javascript:alert(1)"],
    ["dont le schéma finit par http", "xhttp://api.local"],
    ["dont le schéma commence par http", "httpx://api.local"],
  ])("refuse une VITE_API_URL %s en nommant la variable", (_case, value) => {
    expect(configOf({ env: makeEnv({ VITE_API_URL: value }), href: WEB_URL, ...DEV })).toEqual({
      kind: "invalid",
      message:
        "Configuration invalide : VITE_API_URL manque ou n'est pas une URL http(s) (voir .env.example).",
    });
  });

  it.each([
    ["absente", undefined],
    ["vide", ""],
    ["qui n'est pas une URL", "front-local"],
  ])("refuse une WEB_URL %s en nommant la variable", (_case, value) => {
    expect(configOf({ env: makeEnv({ VITE_WEB_URL: value }), href: WEB_URL, ...DEV })).toEqual({
      kind: "invalid",
      message:
        "Configuration invalide : WEB_URL manque ou n'est pas une URL http(s) (voir .env.example).",
    });
  });

  it("en dev, redirige une page servie depuis une autre origine vers celle de WEB_URL, chemin compris", () => {
    expect(
      configOf({
        env: makeEnv(),
        href: "http://localhost:5173/projets/42?onglet=tokens#couleurs",
        ...DEV,
      }),
    ).toEqual({
      kind: "redirect",
      to: `${WEB_URL}/projets/42?onglet=tokens#couleurs`,
    });
  });

  it("en dev, compare les origines et non les URL entières", () => {
    expect(
      configOf({
        env: makeEnv({ VITE_WEB_URL: `${WEB_URL}/` }),
        href: `${WEB_URL}/connexion`,
        ...DEV,
      }),
    ).toEqual({ kind: "ready", apiUrl: API_URL });
  });

  it("en production, ne redirige pas une page servie depuis une autre origine", () => {
    expect(
      configOf({ env: makeEnv(), href: "https://pr-12.dezyn-web.workers.dev/", ...PRODUCTION }),
    ).toEqual({ kind: "ready", apiUrl: API_URL });
  });

  it.each([
    ["absente", undefined],
    ["vide", ""],
  ])("en production, une WEB_URL %s ne bloque pas l'app, qui ne s'en sert pas", (_case, value) => {
    expect(
      configOf({
        env: makeEnv({ VITE_WEB_URL: value }),
        href: "https://dezyn.dev/",
        ...PRODUCTION,
      }),
    ).toEqual({ kind: "ready", apiUrl: API_URL });
  });

  it("en production, refuse toujours une VITE_API_URL absente", () => {
    expect(
      configOf({
        env: makeEnv({ VITE_API_URL: undefined }),
        href: "https://dezyn.dev/",
        ...PRODUCTION,
      }),
    ).toEqual({
      kind: "invalid",
      message:
        "Configuration invalide : VITE_API_URL manque ou n'est pas une URL http(s) (voir .env.example).",
    });
  });
});
