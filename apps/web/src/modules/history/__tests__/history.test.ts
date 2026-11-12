import { describe, expect, it } from "vitest";

import { err, ok } from "@repo/result";

import { createHistory } from "../history-module.ts";

const API_URL = "https://api.dezyn.dev";
const PROJECT_ID = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";

const makeAuthor = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  kind: "member",
  userId: "3e8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
  name: "Ada Lovelace",
  membership: "active",
  ...overrides,
});

const makeEntryOutput = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: "0b8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
  action: "project.created",
  spaceId: "1c8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
  projectId: PROJECT_ID,
  author: makeAuthor(),
  clientId: null,
  before: null,
  after: { name: "Site vitrine" },
  occurredAt: "2026-10-18T12:00:00.000Z",
  correlationId: "creation-du-projet-1",
  ...overrides,
});

const makePageOutput = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  entries: [makeEntryOutput()],
  nextCursor: null,
  purgedBefore: null,
  ...overrides,
});

type Call = { readonly url: string; readonly init: RequestInit };

const answering = (response: () => Response) => {
  const calls: Call[] = [];
  const fetch = (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(response());
  };
  return { history: createHistory({ apiUrl: API_URL, fetch }), calls };
};

const json =
  (body: unknown, status = 200) =>
  () =>
    Response.json(body, { status });

const firstEntryOf = async (history: ReturnType<typeof answering>["history"]) => {
  const page = await history.readHistory({ projectId: PROJECT_ID });
  return page.ok ? page.value.entries[0] : undefined;
};

describe("lecture de l'historique d'un projet dans l'app web (ADR 0044 §6)", () => {
  it("demande la première page à l'API avec le cookie du navigateur, sans limite", async () => {
    const { history, calls } = answering(json(makePageOutput()));

    await history.readHistory({ projectId: PROJECT_ID });

    expect(calls).toEqual([
      {
        url: `${API_URL}/v1/projects/${PROJECT_ID}/history`,
        init: { method: "GET", credentials: "include" },
      },
    ]);
  });

  it("donne les entrées dans l'ordre de l'API, avec leur action, leur auteur et leur date", async () => {
    const later = makeEntryOutput({
      id: "5a8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
      action: "token.created",
      occurredAt: "2026-10-19T08:30:00.000Z",
    });
    const { history } = answering(json(makePageOutput({ entries: [later, makeEntryOutput()] })));

    expect(await history.readHistory({ projectId: PROJECT_ID })).toEqual(
      ok({
        entries: [
          {
            id: later.id,
            action: "token.created",
            author: { kind: "member", name: "Ada Lovelace", left: false },
            clientId: undefined,
            occurredAt: new Date("2026-10-19T08:30:00.000Z"),
          },
          {
            id: makeEntryOutput().id,
            action: "project.created",
            author: { kind: "member", name: "Ada Lovelace", left: false },
            clientId: undefined,
            occurredAt: new Date("2026-10-18T12:00:00.000Z"),
          },
        ],
        purgedBefore: undefined,
      }),
    );
  });

  it("garde l'IA qui a agi", async () => {
    const { history } = answering(
      json(makePageOutput({ entries: [makeEntryOutput({ clientId: "client-claude" })] })),
    );

    expect((await firstEntryOf(history))?.clientId).toBe("client-claude");
  });

  it("dit qu'un membre a quitté l'espace", async () => {
    const { history } = answering(
      json(
        makePageOutput({
          entries: [makeEntryOutput({ author: makeAuthor({ membership: "left" }) })],
        }),
      ),
    );

    expect((await firstEntryOf(history))?.author).toEqual({
      kind: "member",
      name: "Ada Lovelace",
      left: true,
    });
  });

  it("garde l'entrée d'un auteur dont l'app ne connaît pas la forme (ADR 0023 §2)", async () => {
    const { history } = answering(
      json(makePageOutput({ entries: [makeEntryOutput({ author: { kind: "system" } })] })),
    );

    expect((await firstEntryOf(history))?.author).toEqual({ kind: "unknown" });
  });

  it.each([
    ["une forme inconnue qui porte un nom", { kind: "bot", name: "Robot" }],
    ["un membre sans nom", { kind: "member", userId: makeAuthor().userId }],
    ["un membre dont le nom n'est pas un texte", { kind: "member", name: 42 }],
  ])("donne un auteur inconnu pour %s", async (_case, author) => {
    const { history } = answering(json(makePageOutput({ entries: [makeEntryOutput({ author })] })));

    expect((await firstEntryOf(history))?.author).toEqual({ kind: "unknown" });
  });

  it("garde une action et une appartenance inconnues de l'app (ADR 0023 §2)", async () => {
    const { history } = answering(
      json(
        makePageOutput({
          entries: [
            makeEntryOutput({
              action: "token.archived",
              author: makeAuthor({ membership: "suspended" }),
            }),
          ],
        }),
      ),
    );

    const entry = await firstEntryOf(history);

    expect(entry?.action).toBe("token.archived");
    expect(entry?.author).toEqual({ kind: "member", name: "Ada Lovelace", left: false });
  });

  it("donne la date avant laquelle l'historique a été purgé", async () => {
    const { history } = answering(
      json(makePageOutput({ purgedBefore: "2026-09-01T00:00:00.000Z" })),
    );

    const page = await history.readHistory({ projectId: PROJECT_ID });

    expect(page.ok && page.value.purgedBefore).toEqual(new Date("2026-09-01T00:00:00.000Z"));
  });

  it("donne not_found pour un identifiant qui n'est pas un UUID, sans appeler l'API", async () => {
    const { history, calls } = answering(json(makePageOutput()));

    expect(await history.readHistory({ projectId: "projet-1" })).toEqual(err("not_found"));
    expect(calls).toEqual([]);
  });

  it.each([
    [401, "unauthenticated"],
    [404, "not_found"],
    [500, "unavailable"],
    [503, "unavailable"],
    [429, "unavailable"],
    [400, "invalid_response"],
    [403, "invalid_response"],
  ] as const)("donne, sur une réponse %i, %s", async (status, failure) => {
    const { history } = answering(json({}, status));

    expect(await history.readHistory({ projectId: PROJECT_ID })).toEqual(err(failure));
  });

  it("donne unavailable quand l'API est injoignable", async () => {
    const history = createHistory({
      apiUrl: API_URL,
      fetch: () => Promise.reject(new TypeError("Failed to fetch")),
    });

    expect(await history.readHistory({ projectId: PROJECT_ID })).toEqual(err("unavailable"));
  });

  it.each([
    ["une page sans date de purge", json({ entries: [], nextCursor: null })],
    [
      "une entrée sans date",
      json(makePageOutput({ entries: [makeEntryOutput({ occurredAt: undefined })] })),
    ],
    ["un corps qui n'est pas du JSON", () => new Response("<html>", { status: 200 })],
  ])("donne invalid_response sur %s", async (_case, response) => {
    const { history } = answering(response);

    expect(await history.readHistory({ projectId: PROJECT_ID })).toEqual(err("invalid_response"));
  });
});
