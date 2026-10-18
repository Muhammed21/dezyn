import { randomBytes, timingSafeEqual } from "node:crypto";

import { type Context, Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { z } from "zod";

import type { AppEnv } from "../../../platform/http.ts";
import type { Auth } from "../application/auth.ts";
import {
  CONSENT_PATH,
  LOGIN_PATH,
  PAGE_MESSAGES,
  renderConsentPage,
  renderExpiredPage,
  renderLoginPage,
} from "./pages.ts";

const CSRF_COOKIE = "dezyn_csrf";

type PageContext = Context<AppEnv>;
type Form = Readonly<Record<string, unknown>>;

const newCsrfToken = (): string => randomBytes(32).toString("base64url");

const sameToken = (left: string, right: string): boolean => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
};

const field = (form: Form, name: string): string => {
  const value = form[name];
  return typeof value === "string" ? value : "";
};

const Redirect = z.object({ url: z.string() });
const PublicClient = z.object({ client_name: z.string() });

const queryOf = (c: PageContext): string => new URL(c.req.url).search;

const parsed = async <T>(schema: z.ZodType<T>, response: Response): Promise<T | undefined> =>
  response.ok ? schema.safeParse(await response.json()).data : undefined;

const sendHtml = (c: PageContext, status: 200 | 400 | 401, html: string) => {
  c.header("cache-control", "no-store");
  return c.html(html, status);
};

const redirectWithCookies = (c: PageContext, from: Response, location: string) => {
  from.headers.getSetCookie().forEach((cookie) => {
    c.header("set-cookie", cookie, { append: true });
  });
  return c.redirect(location, 302);
};

export const authPages = ({ auth, baseURL }: { readonly auth: Auth; readonly baseURL: string }) => {
  const origin = new URL(baseURL).origin;
  const secure = new URL(baseURL).protocol === "https:";
  const pages = new Hono<AppEnv>();

  const issueCsrf = (c: PageContext): string => {
    const csrf = newCsrfToken();
    setCookie(c, CSRF_COOKIE, csrf, { httpOnly: true, sameSite: "Strict", secure, path: "/" });
    return csrf;
  };

  const isForged = (c: PageContext, form: Form): boolean =>
    c.req.header("origin") !== origin ||
    !sameToken(field(form, "csrf"), getCookie(c, CSRF_COOKIE) ?? "");

  const callAuth = (c: PageContext, path: string, body?: unknown) => {
    const headers = new Headers(c.req.raw.headers);
    headers.delete("content-length");
    headers.set("content-type", "application/json");
    return auth.handle(
      new Request(new URL(`/auth${path}`, baseURL), {
        method: body === undefined ? "GET" : "POST",
        headers,
        body: body === undefined ? null : JSON.stringify(body),
      }),
    );
  };

  pages.get(LOGIN_PATH, (c) =>
    sendHtml(c, 200, renderLoginPage({ csrf: issueCsrf(c), oauthQuery: queryOf(c) })),
  );

  pages.post(LOGIN_PATH, async (c) => {
    const form = await c.req.parseBody();
    if (isForged(c, form)) {
      return c.text("Forbidden", 403);
    }
    const oauthQuery = field(form, "oauth_query");
    const email = field(form, "email");
    const result = await callAuth(c, "/sign-in/email", {
      email,
      password: field(form, "password"),
      oauth_query: oauthQuery,
    });
    const redirect = await parsed(Redirect, result);
    if (redirect !== undefined) {
      return redirectWithCookies(c, result, redirect.url);
    }
    return sendHtml(
      c,
      401,
      renderLoginPage({
        csrf: issueCsrf(c),
        oauthQuery,
        email,
        error: PAGE_MESSAGES.credentials,
      }),
    );
  });

  pages.get(CONSENT_PATH, async (c) => {
    const client = await callAuth(
      c,
      `/oauth2/public-client?${new URLSearchParams({ client_id: c.req.query("client_id") ?? "" })}`,
    );
    const publicClient = await parsed(PublicClient, client);
    if (publicClient === undefined) {
      return sendHtml(c, 400, renderExpiredPage());
    }
    return sendHtml(
      c,
      200,
      renderConsentPage({
        csrf: issueCsrf(c),
        oauthQuery: queryOf(c),
        clientName: publicClient.client_name,
      }),
    );
  });

  pages.post(CONSENT_PATH, async (c) => {
    const form = await c.req.parseBody();
    if (isForged(c, form)) {
      return c.text("Forbidden", 403);
    }
    const result = await callAuth(c, "/oauth2/consent", {
      accept: field(form, "accept") === "true",
      oauth_query: field(form, "oauth_query"),
    });
    const redirect = await parsed(Redirect, result);
    if (redirect === undefined) {
      return sendHtml(c, 400, renderExpiredPage());
    }
    return redirectWithCookies(c, result, redirect.url);
  });

  return pages;
};
