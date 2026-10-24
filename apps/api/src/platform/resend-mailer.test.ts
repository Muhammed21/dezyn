import { afterEach, describe, expect, it, vi } from "vitest";

import { err, ok } from "@repo/result";

import type { LogRecord } from "./logging.ts";
import { createResendMailer, type Fetch } from "./resend-mailer.ts";

const makeEmail = () => ({
  to: "grace@example.com",
  subject: "Invitation",
  text: "Rejoignez l'espace.",
});

const sendWith = async (fetch: Fetch) => {
  const logged: LogRecord[] = [];
  const mailer = createResendMailer({
    apiKey: "re_cle_de_test",
    from: "no-reply@dezyn.dev",
    fetch,
    log: (record) => logged.push(record),
  });

  const result = await mailer.send(makeEmail());

  return { result, logged };
};

const respondingWith =
  (status: number): Fetch =>
  async () =>
    new Response(JSON.stringify({ id: "49a3999c" }), { status });

const hanging: Fetch = (_, init) =>
  new Promise((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
  });

afterEach(() => {
  vi.useRealTimers();
});

describe("l'envoi par Resend", () => {
  it("poste l'email à l'API de Resend, depuis dezyn <MAIL_FROM>, avec la clé d'API", async () => {
    const requests: { readonly url: string; readonly init: RequestInit }[] = [];
    const fetch: Fetch = async (url, init) => {
      requests.push({ url, init });
      return new Response(JSON.stringify({ id: "49a3999c" }), { status: 200 });
    };

    const { result, logged } = await sendWith(fetch);

    expect(result).toEqual(ok(undefined));
    expect(logged).toEqual([]);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("https://api.resend.com/emails");
    expect(requests[0]?.init.method).toBe("POST");
    expect(Object.fromEntries(new Headers(requests[0]?.init.headers))).toEqual({
      authorization: "Bearer re_cle_de_test",
      "content-type": "application/json",
    });
    expect(await new Response(requests[0]?.init.body).json()).toEqual({
      from: "dezyn <no-reply@dezyn.dev>",
      to: "grace@example.com",
      subject: "Invitation",
      text: "Rejoignez l'espace.",
    });
  });

  it.each([201, 299])("un statut %i est un envoi réussi", async (status) => {
    const { result } = await sendWith(respondingWith(status));

    expect(result).toEqual(ok(undefined));
  });

  it.each([300, 403, 429, 500])(
    "un statut %i est journalisé et rend le mail indisponible",
    async (status) => {
      const { result, logged } = await sendWith(respondingWith(status));

      expect(result).toEqual(err("mail_unavailable"));
      expect(logged).toEqual([{ level: "error", msg: "email send failed", status }]);
    },
  );

  it.each(["rate_limit_exceeded", "daily_quota_exceeded"])(
    "un refus nommé %s par Resend est journalisé avec son nom",
    async (name) => {
      const refusing: Fetch = async () =>
        new Response(JSON.stringify({ statusCode: 429, name, message: "Too many" }), {
          status: 429,
        });

      const { logged } = await sendWith(refusing);

      expect(logged).toEqual([
        { level: "error", msg: "email send failed", status: 429, reason: name },
      ]);
    },
  );

  it.each([
    ["un corps qui n'est pas du JSON", "Bad Gateway"],
    ["un nom qui n'est pas une chaîne", JSON.stringify({ name: 42 })],
  ])("un refus avec %s est journalisé sans nom", async (_, body) => {
    const refusing: Fetch = async () => new Response(body, { status: 502 });

    const { logged } = await sendWith(refusing);

    expect(logged).toEqual([{ level: "error", msg: "email send failed", status: 502 }]);
  });

  it("un échec réseau est journalisé et rend le mail indisponible", async () => {
    const failure = new TypeError("fetch failed");

    const { result, logged } = await sendWith(() => Promise.reject(failure));

    expect(result).toEqual(err("mail_unavailable"));
    expect(logged).toEqual([
      { level: "error", msg: "email send failed", error: "fetch failed", stack: failure.stack },
    ]);
  });

  it("un envoi terminé ne laisse pas de minuteur en attente", async () => {
    vi.useFakeTimers();

    await sendWith(respondingWith(200));

    expect(vi.getTimerCount()).toBe(0);
  });

  it("une réponse qui tarde plus de 10 secondes est abandonnée", async () => {
    vi.useFakeTimers();

    const sending = sendWith(hanging);
    await vi.advanceTimersByTimeAsync(9_999);
    const settledEarly = await Promise.race([sending.then(() => true), Promise.resolve(false)]);
    await vi.advanceTimersByTimeAsync(1);
    const { result, logged } = await sending;

    expect(settledEarly).toBe(false);
    expect(result).toEqual(err("mail_unavailable"));
    expect(logged).toEqual([
      expect.objectContaining({
        level: "error",
        msg: "email send failed",
        error: "no answer from Resend after 10000 ms",
      }),
    ]);
  });
});
