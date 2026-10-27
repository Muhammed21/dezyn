import { describe, expect, it } from "vitest";

import type { PostgresDatabase } from "#db";
import { type App, BASE_URL, callMcp, withIdentityApp } from "#testing/authorization-flow.ts";
import {
  invite,
  makeOutbox,
  seedSpaceWithInvitedEditor,
  seedTeamSpaceWith,
  tokenOf,
} from "#testing/space-fixtures.ts";
import { addToken } from "#testing/token-fixtures.ts";

type Member = { readonly accessToken: string; readonly userId: string };

type HistoryEntry = {
  readonly action: string;
  readonly clientId: string | null;
  readonly author: { readonly userId: string; readonly membership: string };
};

const asOwner = (accessToken: string, method: string) => ({
  method,
  headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
});

const seedSharedProject = async (
  app: App,
  db: PostgresDatabase,
  outbox: ReturnType<typeof makeOutbox>,
) => {
  const { ada, grace, spaceId } = await seedSpaceWithInvitedEditor(app, db, outbox);
  const created = await app.request(`${BASE_URL}/v1/spaces/${spaceId}/projects`, {
    ...asOwner(ada.accessToken, "POST"),
    body: JSON.stringify({ name: "Site vitrine" }),
  });
  const { id } = await created.json();
  const projectId = String(id);
  await addToken(app, { accessToken: grace.accessToken, projectId });
  return { ada, grace, spaceId, projectId };
};

const leave = (app: App, { accessToken, spaceId }: { accessToken: string; spaceId: string }) =>
  app.request(`${BASE_URL}/v1/spaces/${spaceId}/members/me`, asOwner(accessToken, "DELETE"));

const removeMember = (
  app: App,
  { owner, spaceId, member }: { owner: Member; spaceId: string; member: Member },
) =>
  app.request(
    `${BASE_URL}/v1/spaces/${spaceId}/members/${member.userId}`,
    asOwner(owner.accessToken, "DELETE"),
  );

const promoteToOwner = (
  app: App,
  { owner, spaceId, member }: { owner: Member; spaceId: string; member: Member },
) =>
  app.request(`${BASE_URL}/v1/spaces/${spaceId}/members/${member.userId}`, {
    ...asOwner(owner.accessToken, "PATCH"),
    body: JSON.stringify({ role: "owner" }),
  });

const reinvite = async (
  app: App,
  {
    owner,
    spaceId,
    member,
    outbox,
  }: { owner: Member; spaceId: string; member: Member; outbox: ReturnType<typeof makeOutbox> },
) => {
  await invite(app, { accessToken: owner.accessToken, spaceId });
  await app.request(
    `${BASE_URL}/v1/invitations/${tokenOf(outbox.sent.at(-1))}/accept`,
    asOwner(member.accessToken, "POST"),
  );
};

const historyByApi = async (
  app: App,
  { reader, projectId }: { reader: Member; projectId: string },
): Promise<readonly HistoryEntry[]> => {
  const response = await app.request(`${BASE_URL}/v1/projects/${projectId}/history`, {
    headers: { authorization: `Bearer ${reader.accessToken}` },
  });
  const { entries } = await response.json();
  return entries;
};

const historyByMcp = async (
  app: App,
  { reader, projectId }: { reader: Member; projectId: string },
): Promise<readonly HistoryEntry[]> => {
  const response = await callMcp(app, {
    token: reader.accessToken,
    method: "tools/call",
    params: { name: "read_history", arguments: { projectId } },
  });
  const { result } = await response.json();
  return result.structuredContent.entries;
};

const membershipsOf = (entries: readonly HistoryEntry[], author: Member) =>
  entries
    .filter((entry) => entry.author.userId === author.userId)
    .map(({ action, author: { membership } }) => ({ action, membership }));

describe("l'historique dit si l'auteur d'une entrée est encore membre de l'espace (ADR 0038)", () => {
  it("un auteur encore membre est active", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { ada, grace, projectId } = await seedSharedProject(app, db, outbox);

        const entries = await historyByApi(app, { reader: ada, projectId });

        expect(membershipsOf(entries, ada)).toEqual([
          { action: "project.created", membership: "active" },
        ]);
        expect(membershipsOf(entries, grace)).toEqual([
          { action: "token.created", membership: "active" },
        ]);
      },
      { mailer: outbox.mailer },
    );
  });

  it("un éditeur parti est left, même s'il reste membre d'un autre espace", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { ada, grace, spaceId, projectId } = await seedSharedProject(app, db, outbox);
        await seedTeamSpaceWith(db, { userId: grace.userId, role: "editor" });

        await leave(app, { accessToken: grace.accessToken, spaceId });
        const entries = await historyByApi(app, { reader: ada, projectId });

        expect(membershipsOf(entries, grace)).toEqual([
          { action: "token.created", membership: "left" },
        ]);
        expect(membershipsOf(entries, ada)).toEqual([
          { action: "project.created", membership: "active" },
        ]);
      },
      { mailer: outbox.mailer },
    );
  });

  it("un éditeur retiré par un propriétaire est left (ADR 0031)", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { ada, grace, spaceId, projectId } = await seedSharedProject(app, db, outbox);

        await removeMember(app, { owner: ada, spaceId, member: grace });
        const entries = await historyByApi(app, { reader: ada, projectId });

        expect(membershipsOf(entries, grace)).toEqual([
          { action: "token.created", membership: "left" },
        ]);
      },
      { mailer: outbox.mailer },
    );
  });

  it("un éditeur dont le rôle change reste active", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { ada, grace, spaceId, projectId } = await seedSharedProject(app, db, outbox);

        const promoted = await promoteToOwner(app, { owner: ada, spaceId, member: grace });
        const entries = await historyByApi(app, { reader: ada, projectId });

        expect(promoted.status).toBe(200);
        expect(membershipsOf(entries, grace)).toEqual([
          { action: "token.created", membership: "active" },
        ]);
      },
      { mailer: outbox.mailer },
    );
  });

  it("un éditeur parti puis réinvité redevient active sur ses entrées d'avant son départ", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { ada, grace, spaceId, projectId } = await seedSharedProject(app, db, outbox);
        await leave(app, { accessToken: grace.accessToken, spaceId });

        await reinvite(app, { owner: ada, spaceId, member: grace, outbox });
        const entries = await historyByApi(app, { reader: ada, projectId });

        expect(membershipsOf(entries, grace)).toEqual([
          { action: "token.created", membership: "active" },
        ]);
      },
      { mailer: outbox.mailer },
    );
  });

  it("l'entrée de l'IA d'un éditeur parti est left, par l'API comme par read_history", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { ada, grace, spaceId, projectId } = await seedSharedProject(app, db, outbox);
        await historyByMcp(app, { reader: grace, projectId });

        await leave(app, { accessToken: grace.accessToken, spaceId });
        const byApi = await historyByApi(app, { reader: ada, projectId });
        const byMcp = await historyByMcp(app, { reader: ada, projectId });

        const aiEntry = byApi.find(
          (entry) => entry.action === "mcp.read_history" && entry.author.userId === grace.userId,
        );
        expect(aiEntry).toMatchObject({
          clientId: expect.any(String),
          author: { membership: "left" },
        });
        expect(membershipsOf(byMcp, grace)).toEqual(membershipsOf(byApi, grace));
      },
      { mailer: outbox.mailer },
    );
  });
});
