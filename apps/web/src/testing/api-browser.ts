import type { App } from "@repo/api/testing/authorization-flow.ts";
import { WEB_URL } from "@repo/api/testing/authorization-flow.ts";

export const makeApiBrowser = (app: App, { ip }: { readonly ip: string }) => {
  const jar = new Map<string, string>();
  return async (url: string, init: RequestInit): Promise<Response> => {
    const response = await app.request(url, {
      ...init,
      headers: {
        ...Object.fromEntries(new Headers(init.headers)),
        origin: WEB_URL,
        "x-forwarded-for": ip,
        cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; "),
      },
    });
    response.headers.getSetCookie().forEach((cookie) => {
      const [pair = ""] = cookie.split(";");
      const separator = pair.indexOf("=");
      jar.set(pair.slice(0, separator), pair.slice(separator + 1));
    });
    return response;
  };
};
