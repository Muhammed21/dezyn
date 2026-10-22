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

const ApiEnv = z.object({
  DATABASE_URL: z
    .string({ error: MISSING })
    .pipe(z.url({ protocol: /^postgres(ql)?$/, error: "URL postgresql:// attendue" })),
  BETTER_AUTH_SECRET: z.string({ error: MISSING }).min(32, { error: "32 caractères au moins" }),
  BETTER_AUTH_URL: httpUrl(),
  SMTP_HOST: text(),
  SMTP_PORT: port(),
  MAIL_FROM: text(),
  WEB_URL: httpUrl(),
  TRUSTED_IP_HEADER: text().default("cf-connecting-ip"),
  PORT: port().default(3000),
});

export type ApiConfig = {
  readonly databaseUrl: string;
  readonly authSecret: string;
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
  if (!parsed.success) {
    return err(parsed.error.issues.map(({ path, message }) => `${String(path[0])} : ${message}`));
  }
  const { data } = parsed;
  return ok({
    databaseUrl: data.DATABASE_URL,
    authSecret: data.BETTER_AUTH_SECRET,
    baseURL: data.BETTER_AUTH_URL,
    trustedIpHeader: data.TRUSTED_IP_HEADER,
    smtp: { host: data.SMTP_HOST, port: data.SMTP_PORT, from: data.MAIL_FROM },
    webUrl: data.WEB_URL,
    port: data.PORT,
  });
};
