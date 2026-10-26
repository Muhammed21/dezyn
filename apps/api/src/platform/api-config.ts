import { z } from "zod";

import { err, ok, type Result } from "@repo/result";

const MISSING = "manquante";
const PORT = "port entre 1 et 65535 attendu";
const HTTP_URL = "URL http(s) attendue";

const text = () => z.string({ error: MISSING }).min(1, { error: "vide" });

const httpUrl = () =>
  z.string({ error: MISSING }).pipe(z.url({ protocol: /^https?$/, error: HTTP_URL }));

const port = () =>
  z
    .string({ error: MISSING })
    .pipe(z.coerce.number<string>({ error: PORT }).int().min(1).max(65_535));

const authSecret = () => z.string({ error: MISSING }).min(32, { error: "32 caractères au moins" });

const trustedIpHeader = () => text().default("cf-connecting-ip");

const postgresUrl = () =>
  z
    .string({ error: MISSING })
    .pipe(z.url({ protocol: /^postgres(ql)?$/, error: "URL postgresql:// attendue" }));

const ApiEnv = z.object({
  DATABASE_URL: postgresUrl(),
  BETTER_AUTH_SECRET: authSecret(),
  BETTER_AUTH_URL: httpUrl(),
  SMTP_HOST: text(),
  SMTP_PORT: port(),
  MAIL_FROM: text(),
  WEB_URL: httpUrl(),
  TRUSTED_IP_HEADER: trustedIpHeader(),
  PORT: port().default(3000),
});

const WorkerEnv = z
  .object({
    HYPERDRIVE: z
      .object({ connectionString: text() }, { error: "binding Hyperdrive attendu" })
      .optional(),
    DATABASE_URL: postgresUrl().optional(),
    BETTER_AUTH_SECRET: authSecret(),
    BETTER_AUTH_URL: httpUrl(),
    WEB_URL: httpUrl(),
    TRUSTED_IP_HEADER: trustedIpHeader(),
    RESEND_API_KEY: text().optional(),
    MAIL_FROM: z.email({ error: "adresse email attendue" }).optional(),
    EMAIL_DELIVERY: z.literal("log", { error: "seule la valeur log est admise" }).optional(),
  })
  .refine((env) => env.HYPERDRIVE !== undefined || env.DATABASE_URL !== undefined, {
    path: ["HYPERDRIVE"],
    error: "manquante, comme DATABASE_URL",
    when: () => true,
  })
  .refine((env) => env.HYPERDRIVE === undefined || env.DATABASE_URL === undefined, {
    path: ["DATABASE_URL"],
    error: "en double avec HYPERDRIVE",
  })
  .refine((env) => env.RESEND_API_KEY === undefined || env.MAIL_FROM !== undefined, {
    path: ["MAIL_FROM"],
    error: MISSING,
  });

const issuesOf = (error: z.ZodError): readonly string[] =>
  error.issues.map(({ path, message }) => `${String(path[0])} : ${message}`);

const VERSIONED_SECRET = /^BETTER_AUTH_SECRET_(.*)$/;
const VERSION = /^[1-9]\d*$/;

const versionedSecretOf = (
  name: string,
  version: string,
  value: unknown,
): Result<AuthSecret, readonly string[]> => {
  const secret = authSecret().safeParse(value);
  if (VERSION.test(version) && secret.success) {
    return ok({ version: Number(version), value: secret.data });
  }
  return err([
    ...(VERSION.test(version) ? [] : [`${name} : numéro de version entier et positif attendu`]),
    ...(secret.success ? [] : secret.error.issues.map(({ message }) => `${name} : ${message}`)),
  ]);
};

const versionedSecretsOf = (env: unknown): Result<readonly AuthSecret[], readonly string[]> => {
  const secrets = Object.entries(z.record(z.string(), z.unknown()).catch({}).parse(env)).flatMap(
    ([name, value]) => {
      const version = VERSIONED_SECRET.exec(name)?.[1];
      return version === undefined ? [] : [versionedSecretOf(name, version, value)];
    },
  );
  const issues = secrets.flatMap((secret) => (secret.ok ? [] : secret.error));
  if (issues.length > 0) {
    return err(issues);
  }
  return ok(
    secrets
      .flatMap((secret) => (secret.ok ? [secret.value] : []))
      .toSorted((left, right) => right.version - left.version),
  );
};

export type AuthSecret = { readonly version: number; readonly value: string };

const issuesOfBoth = (
  parsed: { readonly success: true } | { readonly success: false; readonly error: z.ZodError },
  secrets: Result<readonly AuthSecret[], readonly string[]>,
): readonly string[] => [
  ...(parsed.success ? [] : issuesOf(parsed.error)),
  ...(secrets.ok ? [] : secrets.error),
];

export type ApiConfig = {
  readonly databaseUrl: string;
  readonly authSecret: string;
  readonly authSecrets: readonly AuthSecret[];
  readonly baseURL: string;
  readonly trustedIpHeader: string;
  readonly smtp: { readonly host: string; readonly port: number; readonly from: string };
  readonly webUrl: string;
  readonly port: number;
};

export const readApiConfig = (
  env: Readonly<Record<string, string | undefined>>,
): Result<ApiConfig, readonly string[]> => {
  const parsed = ApiEnv.safeParse(env);
  const secrets = versionedSecretsOf(env);
  if (!parsed.success || !secrets.ok) {
    return err(issuesOfBoth(parsed, secrets));
  }
  const { data } = parsed;
  return ok({
    databaseUrl: data.DATABASE_URL,
    authSecret: data.BETTER_AUTH_SECRET,
    authSecrets: secrets.value,
    baseURL: data.BETTER_AUTH_URL,
    trustedIpHeader: data.TRUSTED_IP_HEADER,
    smtp: { host: data.SMTP_HOST, port: data.SMTP_PORT, from: data.MAIL_FROM },
    webUrl: data.WEB_URL,
    port: data.PORT,
  });
};

export type WorkerConfig = Omit<ApiConfig, "smtp" | "port"> & {
  readonly email?: { readonly apiKey: string; readonly from: string };
  readonly emailDelivery?: "log";
};

export const readWorkerConfig = (bindings: unknown): Result<WorkerConfig, readonly string[]> => {
  const parsed = WorkerEnv.safeParse(bindings);
  const secrets = versionedSecretsOf(bindings);
  if (!parsed.success || !secrets.ok) {
    return err(issuesOfBoth(parsed, secrets));
  }
  const { data } = parsed;
  return ok({
    databaseUrl: data.HYPERDRIVE?.connectionString ?? data.DATABASE_URL ?? "",
    authSecret: data.BETTER_AUTH_SECRET,
    authSecrets: secrets.value,
    baseURL: data.BETTER_AUTH_URL,
    trustedIpHeader: data.TRUSTED_IP_HEADER,
    webUrl: data.WEB_URL,
    ...(data.RESEND_API_KEY && data.MAIL_FROM
      ? { email: { apiKey: data.RESEND_API_KEY, from: data.MAIL_FROM } }
      : {}),
    ...(data.EMAIL_DELIVERY ? { emailDelivery: data.EMAIL_DELIVERY } : {}),
  });
};
