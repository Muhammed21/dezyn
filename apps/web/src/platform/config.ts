import { z } from "zod";

export type Config =
  | { readonly kind: "ready"; readonly apiUrl: string }
  | { readonly kind: "invalid"; readonly message: string }
  | { readonly kind: "redirect"; readonly to: string };

const HttpUrl = z.url({ protocol: /^https?$/ });

const invalid = (variable: string): Config => ({
  kind: "invalid",
  message: `Configuration invalide : ${variable} manque ou n'est pas une URL http(s) (voir .env.example).`,
});

export const configOf = ({
  env,
  href,
  dev,
}: {
  readonly env: Readonly<Record<string, unknown>>;
  readonly href: string;
  readonly dev: boolean;
}): Config => {
  const apiUrl = HttpUrl.safeParse(env["VITE_API_URL"]);
  if (!apiUrl.success) {
    return invalid("VITE_API_URL");
  }
  const webUrl = HttpUrl.safeParse(env["VITE_WEB_URL"]);
  if (!webUrl.success) {
    return invalid("WEB_URL");
  }
  const page = new URL(href);
  const webOrigin = new URL(webUrl.data).origin;
  if (dev && page.origin !== webOrigin) {
    return { kind: "redirect", to: `${webOrigin}${page.pathname}${page.search}${page.hash}` };
  }
  return { kind: "ready", apiUrl: apiUrl.data };
};
