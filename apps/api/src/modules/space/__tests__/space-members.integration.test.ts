import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  ADA,
  type App,
  BASE_URL,
  GRACE,
  obtainAccessToken,
  withIdentityApp,
} from "#testing/authorization-flow.ts";
import {
  invite,
  makeOutbox,
  seedSpaceWithInvitedEditor,
  seedTeamSpace,
  tokenOf,
} from "#testing/space-fixtures.ts";
import { MembersOutput } from "@repo/contracts";

const listMembers = (
  app: App,
  { accessToken, spaceId }: { accessToken: string; spaceId: string },
) =>
  app.request(`${BASE_URL}/v1/spaces/${spaceId}/members`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });

const membersOf = async (app: App, key: { accessToken: string; spaceId: string }) => {
  const response = await listMembers(app, key);
  return MembersOutput.parse(await response.json()).members;
};

const memberRequest = (
  app: App,
  {
    accessToken,
    spaceId,
    memberId,
    method,
    body,
  }: { accessToken: string; spaceId: string; memberId: string; method: string; body?: object },
) =>
  app.request(`${BASE_URL}/v1/spaces/${spaceId}/members/${memberId}`, {
    method,
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const ALAN = {
  name: "Alan Turing",
  email: "alan@dezyn.test",
  password: "encore-un-mot-de-passe-solide",
};

const joinByInvitation = async (
  app: App,
  outbox: ReturnType<typeof makeOutbox>,
  {
    ownerToken,
    spaceId,
    email,
    accessToken,
  }: { ownerToken: string; spaceId: string; email: string; accessToken: string },
) => {
  await invite(app, { accessToken: ownerToken, spaceId, email });
  await app.request(`${BASE_URL}/v1/invitations/${tokenOf(outbox.sent.at(-1))}/accept`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}` },
  });
};

describe("un membre liste les membres de son espace (ADR 0017 §1)", () => {
  it("un propriétaire voit chaque membre actif avec son nom, son email et son rôle, par ordre d'arrivée", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { ada, grace, spaceId } = await seedSpaceWithInvitedEditor(app, db, outbox);

        const response = await listMembers(app, { accessToken: ada.accessToken, spaceId });

        expect(response.status).toBe(200);
        expect(MembersOutput.parse(await response.json())).toEqual({
          members: [
            { userId: ada.userId, name: ADA.name, email: ADA.email, role: "owner" },
            { userId: grace.userId, name: GRACE.name, email: GRACE.email, role: "editor" },
          ],
        });
      },
      { mailer: outbox.mailer },
    );
  });

  it("un éditeur voit aussi les membres de l'espace", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { ada, grace, spaceId } = await seedSpaceWithInvitedEditor(app, db, outbox);

        expect(await membersOf(app, { accessToken: grace.accessToken, spaceId })).toEqual(
          await membersOf(app, { accessToken: ada.accessToken, spaceId }),
        );
      },
      { mailer: outbox.mailer },
    );
  });

  it("un membre dont le rôle a changé n'apparaît qu'une fois, avec son nouveau rôle", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { ada, grace, spaceId } = await seedSpaceWithInvitedEditor(app, db, outbox);
        await memberRequest(app, {
          accessToken: ada.accessToken,
          spaceId,
          memberId: grace.userId,
          method: "PATCH",
          body: { role: "owner" },
        });

        expect(await membersOf(app, { accessToken: ada.accessToken, spaceId })).toEqual([
          { userId: ada.userId, name: ADA.name, email: ADA.email, role: "owner" },
          { userId: grace.userId, name: GRACE.name, email: GRACE.email, role: "owner" },
        ]);
      },
      { mailer: outbox.mailer },
    );
  });

  it("un changement de rôle garde le membre à sa place d'arrivée", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { ada, grace, spaceId } = await seedSpaceWithInvitedEditor(app, db, outbox);
        await memberRequest(app, {
          accessToken: ada.accessToken,
          spaceId,
          memberId: grace.userId,
          method: "PATCH",
          body: { role: "owner" },
        });
        await memberRequest(app, {
          accessToken: grace.accessToken,
          spaceId,
          memberId: ada.userId,
          method: "PATCH",
          body: { role: "editor" },
        });

        expect(await membersOf(app, { accessToken: grace.accessToken, spaceId })).toEqual([
          { userId: ada.userId, name: ADA.name, email: ADA.email, role: "editor" },
          { userId: grace.userId, name: GRACE.name, email: GRACE.email, role: "owner" },
        ]);
      },
      { mailer: outbox.mailer },
    );
  });

  it("un membre retiré n'apparaît plus", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { ada, grace, spaceId } = await seedSpaceWithInvitedEditor(app, db, outbox);
        await memberRequest(app, {
          accessToken: ada.accessToken,
          spaceId,
          memberId: grace.userId,
          method: "DELETE",
        });

        expect(await membersOf(app, { accessToken: ada.accessToken, spaceId })).toEqual([
          { userId: ada.userId, name: ADA.name, email: ADA.email, role: "owner" },
        ]);
      },
      { mailer: outbox.mailer },
    );
  });

  it("un membre retiré puis revenu prend la place de son retour", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { ada, grace, spaceId } = await seedSpaceWithInvitedEditor(app, db, outbox);
        const alan = await obtainAccessToken(app, { user: ALAN });
        await joinByInvitation(app, outbox, {
          ownerToken: ada.accessToken,
          spaceId,
          email: ALAN.email,
          accessToken: alan.accessToken,
        });
        await memberRequest(app, {
          accessToken: ada.accessToken,
          spaceId,
          memberId: grace.userId,
          method: "DELETE",
        });
        await joinByInvitation(app, outbox, {
          ownerToken: ada.accessToken,
          spaceId,
          email: GRACE.email,
          accessToken: grace.accessToken,
        });

        expect(
          (await membersOf(app, { accessToken: ada.accessToken, spaceId })).map(
            ({ userId }) => userId,
          ),
        ).toEqual([ada.userId, alan.userId, grace.userId]);
      },
      { mailer: outbox.mailer },
    );
  });

  it("un non-membre reçoit 404, comme pour un espace inconnu ou un identifiant qui n'est pas un UUID", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken } = await obtainAccessToken(app);
      const othersSpace = await seedTeamSpace(db);

      const statuses = await Promise.all(
        [othersSpace, randomUUID(), "espace-1"].map(async (spaceId) => {
          const response = await listMembers(app, { accessToken, spaceId });
          return response.status;
        }),
      );

      expect(statuses).toEqual([404, 404, 404]);
    }));

  it("sans session, la liste répond 401", () =>
    withIdentityApp(async (app) => {
      const response = await app.request(`${BASE_URL}/v1/spaces/${randomUUID()}/members`);

      expect(response.status).toBe(401);
    }));
});
