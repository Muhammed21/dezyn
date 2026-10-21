import { describe, expect, it } from "vitest";

import { err, ok } from "@repo/result";

import { readApiConfig } from "./api-config.ts";

const makeEnv = (overrides: Readonly<Record<string, string | undefined>> = {}) => ({
  DATABASE_URL: "postgresql://app@127.0.0.1:5432/dezyn",
  BETTER_AUTH_SECRET: "secret-de-test-de-32-caracteres-au-moins",
  BETTER_AUTH_URL: "http://127.0.0.1:3000",
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: "1025",
  MAIL_FROM: "dezyn <no-reply@dezyn.test>",
  WEB_URL: "http://127.0.0.1:5173",
  ...overrides,
});

describe("l'API lit sa configuration dans l'environnement", () => {
  it("un environnement complet donne la configuration, avec l'en-tête d'IP et le port par défaut", () => {
    expect(readApiConfig(makeEnv())).toEqual(
      ok({
        databaseUrl: "postgresql://app@127.0.0.1:5432/dezyn",
        authSecret: "secret-de-test-de-32-caracteres-au-moins",
        baseURL: "http://127.0.0.1:3000",
        trustedIpHeader: "x-forwarded-for",
        smtp: { host: "127.0.0.1", port: 1025, from: "dezyn <no-reply@dezyn.test>" },
        webUrl: "http://127.0.0.1:5173",
        port: 3000,
      }),
    );
  });

  it("TRUSTED_IP_HEADER et PORT remplacent les valeurs par défaut", () => {
    const config = readApiConfig(makeEnv({ TRUSTED_IP_HEADER: "cf-connecting-ip", PORT: "8080" }));

    expect(config).toMatchObject(ok({ trustedIpHeader: "cf-connecting-ip", port: 8080 }));
  });

  it("chaque variable manquante est nommée, toutes en une fois", () => {
    expect(readApiConfig({})).toEqual(
      err([
        "DATABASE_URL : manquante",
        "BETTER_AUTH_SECRET : manquante",
        "BETTER_AUTH_URL : manquante",
        "SMTP_HOST : manquante",
        "SMTP_PORT : manquante",
        "MAIL_FROM : manquante",
        "WEB_URL : manquante",
      ]),
    );
  });

  it.each([
    ["DATABASE_URL", "http://127.0.0.1:5432/dezyn", "URL postgresql:// attendue"],
    ["BETTER_AUTH_SECRET", "x".repeat(31), "32 caractères au moins"],
    ["DATABASE_URL", "xpostgres://127.0.0.1/dezyn", "URL postgresql:// attendue"],
    ["DATABASE_URL", "postgresqlx://127.0.0.1/dezyn", "URL postgresql:// attendue"],
    ["BETTER_AUTH_URL", "127.0.0.1:3000", "URL http(s) attendue"],
    ["BETTER_AUTH_URL", "xhttp://127.0.0.1:3000", "URL http(s) attendue"],
    ["BETTER_AUTH_URL", "httpsx://127.0.0.1:3000", "URL http(s) attendue"],
    ["WEB_URL", "ftp://127.0.0.1", "URL http(s) attendue"],
    ["SMTP_HOST", "", "vide"],
    ["MAIL_FROM", "", "vide"],
    ["SMTP_PORT", "abc", "port entre 1 et 65535 attendu"],
    ["SMTP_PORT", "0", "port entre 1 et 65535 attendu"],
    ["PORT", "65536", "port entre 1 et 65535 attendu"],
    ["PORT", "80.5", "port entre 1 et 65535 attendu"],
    ["TRUSTED_IP_HEADER", "", "vide"],
  ])("%s=%j est refusée : %s", (variable, value, message) => {
    expect(readApiConfig(makeEnv({ [variable]: value }))).toEqual(
      err([`${variable} : ${message}`]),
    );
  });

  it.each([
    ["DATABASE_URL", "postgres://app@127.0.0.1/dezyn"],
    ["BETTER_AUTH_SECRET", "x".repeat(32)],
    ["BETTER_AUTH_URL", "https://api.dezyn.app"],
    ["SMTP_PORT", "1"],
    ["PORT", "65535"],
  ])("%s=%j est acceptée", (variable, value) => {
    expect(readApiConfig(makeEnv({ [variable]: value })).ok).toBe(true);
  });
});
