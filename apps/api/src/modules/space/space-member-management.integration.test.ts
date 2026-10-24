import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  type App,
  BASE_URL,
  obtainAccessToken,
  withIdentityApp,
} from "#testing/authorization-flow.ts";
import {
  makeOutbox,
  membershipsOf,
  openOwnersOf,
  personalSpaceOf,
  promoteToOwner,
  seedSpaceWithInvitedEditor,
  seedTeamSpace,
} from "#testing/space-fixtures.ts";

const LAST_OWNER = "https://dezyn.dev/problems/last-owner";

const SELF_REMOVAL = "https://dezyn.dev/problems/self-removal";

const changeRole = (
  app: App,
  {
    accessToken,
    spaceId,
    memberId,
    role,
  }: { accessToken: string; spaceId: string; memberId: string; role: unknown },
) =>
  app.request(`${BASE_URL}/v1/spaces/${spaceId}/members/${memberId}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ role }),
  });

const removeMember = (
  app: App,
  { accessToken, spaceId, memberId }: { accessToken: string; spaceId: string; memberId: string },
) =>
  app.request(`${BASE_URL}/v1/spaces/${spaceId}/members/${memberId}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${accessToken}` },
  });

const leave = (app: App, { accessToken, spaceId }: { accessToken: string; spaceId: string }) =>
  app.request(`${BASE_URL}/v1/spaces/${spaceId}/members/me`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${accessToken}` },
  });

const readSpace = (app: App, { accessToken, spaceId }: { accessToken: string; spaceId: string }) =>
  app.request(`${BASE_URL}/v1/spaces/${spaceId}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });

describe("un propriétaire change le rôle d'un membre (ADR 0011 §5, ADR 0017 §2)", () => {
  it("un éditeur devient propriétaire : sa ligne se ferme avec role_changed et une ligne propriétaire s'ouvre", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { ada, grace, spaceId } = await seedSpaceWithInvitedEditor(app, db, outbox);

        const response = await changeRole(app, {
          accessToken: ada.accessToken,
          spaceId,
          memberId: grace.userId,
          role: "owner",
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ userId: grace.userId, role: "owner" });
        expect(await membershipsOf(db, { spaceId, userId: grace.userId })).toEqual(
          expect.arrayContaining([
            { role: "editor", closedAt: expect.any(Date), closedReason: "role_changed" },
            { role: "owner", closedAt: null, closedReason: null },
          ]),
        );
        expect(await membershipsOf(db, { spaceId, userId: grace.userId })).toHaveLength(2);
      },
      { mailer: outbox.mailer },
    );
  });

  it("un propriétaire rétrograde un autre propriétaire en éditeur", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { ada, grace, spaceId } = await seedSpaceWithInvitedEditor(app, db, outbox);
        await promoteToOwner(db, { spaceId, userId: grace.userId });

        const response = await changeRole(app, {
          accessToken: ada.accessToken,
          spaceId,
          memberId: grace.userId,
          role: "editor",
        });

        expect(response.status).toBe(200);
        expect(await openOwnersOf(db, spaceId)).toEqual([{ userId: ada.userId }]);
      },
      { mailer: outbox.mailer },
    );
  });

  it("donner à un membre le rôle qu'il a déjà ne ferme ni n'ouvre de ligne", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { ada, grace, spaceId } = await seedSpaceWithInvitedEditor(app, db, outbox);

        const response = await changeRole(app, {
          accessToken: ada.accessToken,
          spaceId,
          memberId: grace.userId,
          role: "editor",
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ userId: grace.userId, role: "editor" });
        expect(await membershipsOf(db, { spaceId, userId: grace.userId })).toEqual([
          { role: "editor", closedAt: null, closedReason: null },
        ]);
      },
      { mailer: outbox.mailer },
    );
  });

  it("rétrograder le dernier propriétaire répond 409 last-owner, et rien ne change", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, userId } = await obtainAccessToken(app);
      const spaceId = await personalSpaceOf(db, userId);

      const response = await changeRole(app, {
        accessToken,
        spaceId,
        memberId: userId,
        role: "editor",
      });

      expect(response.status).toBe(409);
      expect(response.headers.get("content-type")).toBe("application/problem+json");
      expect(await response.json()).toMatchObject({
        type: LAST_OWNER,
        title: "Dernier propriétaire de l'espace",
        status: 409,
      });
      expect(await membershipsOf(db, { spaceId, userId })).toEqual([
        { role: "owner", closedAt: null, closedReason: null },
      ]);
    }));

  it("le dernier propriétaire qui se rétrograde reçoit 409, même quand un éditeur reste", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { ada, spaceId } = await seedSpaceWithInvitedEditor(app, db, outbox);

        const response = await changeRole(app, {
          accessToken: ada.accessToken,
          spaceId,
          memberId: ada.userId,
          role: "editor",
        });

        expect(response.status).toBe(409);
        expect(await openOwnersOf(db, spaceId)).toEqual([{ userId: ada.userId }]);
      },
      { mailer: outbox.mailer },
    );
  });

  it("un éditeur qui change un rôle reçoit 403, et rien ne change", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { ada, grace, spaceId } = await seedSpaceWithInvitedEditor(app, db, outbox);

        const response = await changeRole(app, {
          accessToken: grace.accessToken,
          spaceId,
          memberId: ada.userId,
          role: "editor",
        });

        expect(response.status).toBe(403);
        expect(await openOwnersOf(db, spaceId)).toEqual([{ userId: ada.userId }]);
      },
      { mailer: outbox.mailer },
    );
  });

  it.each([
    ["un utilisateur qui n'est pas membre", () => randomUUID()],
    ["un identifiant qui n'est pas un UUID", () => "pas-un-uuid"],
  ])("viser %s répond 404", (_case, memberIdOf) =>
    withIdentityApp(async (app, db) => {
      const { accessToken, userId } = await obtainAccessToken(app);
      const spaceId = await personalSpaceOf(db, userId);

      const response = await changeRole(app, {
        accessToken,
        spaceId,
        memberId: memberIdOf(),
        role: "owner",
      });

      expect(response.status).toBe(404);
    }),
  );

  it("un non-membre de l'espace reçoit 404", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, userId } = await obtainAccessToken(app);
      const othersSpace = await seedTeamSpace(db);

      const response = await changeRole(app, {
        accessToken,
        spaceId: othersSpace,
        memberId: userId,
        role: "owner",
      });

      expect(response.status).toBe(404);
    }));

  it("un identifiant d'espace qui n'est pas un UUID répond 404", () =>
    withIdentityApp(async (app) => {
      const { accessToken, userId } = await obtainAccessToken(app);

      const response = await changeRole(app, {
        accessToken,
        spaceId: "pas-un-uuid",
        memberId: userId,
        role: "owner",
      });

      expect(response.status).toBe(404);
    }));

  it("un rôle inconnu répond 400", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, userId } = await obtainAccessToken(app);
      const spaceId = await personalSpaceOf(db, userId);

      const response = await changeRole(app, {
        accessToken,
        spaceId,
        memberId: userId,
        role: "admin",
      });

      expect(response.status).toBe(400);
    }));

  it("deux propriétaires qui se rétrogradent l'un l'autre en même temps : le second, devenu éditeur, reçoit 403 (ADR 0017 §4)", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { ada, grace, spaceId } = await seedSpaceWithInvitedEditor(app, db, outbox);
        await promoteToOwner(db, { spaceId, userId: grace.userId });

        const responses = await Promise.all([
          changeRole(app, {
            accessToken: ada.accessToken,
            spaceId,
            memberId: grace.userId,
            role: "editor",
          }),
          changeRole(app, {
            accessToken: grace.accessToken,
            spaceId,
            memberId: ada.userId,
            role: "editor",
          }),
        ]);

        expect(
          responses.map(({ status }) => status).toSorted((left, right) => left - right),
        ).toEqual([200, 403]);
        expect(await openOwnersOf(db, spaceId)).toHaveLength(1);
      },
      { mailer: outbox.mailer },
    );
  });
});

describe("un départ et un changement de rôle simultanés s'excluent (ADR 0017 §4)", () => {
  it("un propriétaire part pendant que l'autre se rétrograde : il reste un propriétaire", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { ada, grace, spaceId } = await seedSpaceWithInvitedEditor(app, db, outbox);
        await promoteToOwner(db, { spaceId, userId: grace.userId });

        await Promise.all([
          leave(app, { accessToken: grace.accessToken, spaceId }),
          changeRole(app, {
            accessToken: ada.accessToken,
            spaceId,
            memberId: ada.userId,
            role: "editor",
          }),
        ]);

        expect(await openOwnersOf(db, spaceId)).toHaveLength(1);
      },
      { mailer: outbox.mailer },
    );
  });

  it("un propriétaire rétrograde un membre qui part au même moment : le membre parti ne retrouve pas de ligne ouverte", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { ada, grace, spaceId } = await seedSpaceWithInvitedEditor(app, db, outbox);
        await promoteToOwner(db, { spaceId, userId: grace.userId });

        await Promise.all([
          leave(app, { accessToken: grace.accessToken, spaceId }),
          changeRole(app, {
            accessToken: ada.accessToken,
            spaceId,
            memberId: grace.userId,
            role: "editor",
          }),
        ]);

        expect(
          (await membershipsOf(db, { spaceId, userId: grace.userId })).filter(
            ({ closedAt }) => closedAt === null,
          ),
        ).toEqual([]);
      },
      { mailer: outbox.mailer },
    );
  });
});

describe("un propriétaire retire un membre (ADR 0031)", () => {
  it("le membre retiré garde sa ligne, fermée avec la raison removed, et perd l'accès", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { ada, grace, spaceId } = await seedSpaceWithInvitedEditor(app, db, outbox);
        const before = Date.now();

        const response = await removeMember(app, {
          accessToken: ada.accessToken,
          spaceId,
          memberId: grace.userId,
        });

        expect(response.status).toBe(204);
        expect(await response.text()).toBe("");
        const [membership] = await membershipsOf(db, { spaceId, userId: grace.userId });
        expect(membership).toMatchObject({ role: "editor", closedReason: "removed" });
        expect(membership?.closedAt?.getTime()).toBeGreaterThanOrEqual(before);
        expect((await readSpace(app, { accessToken: grace.accessToken, spaceId })).status).toBe(
          404,
        );
      },
      { mailer: outbox.mailer },
    );
  });

  it("un propriétaire retire un autre propriétaire", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { ada, grace, spaceId } = await seedSpaceWithInvitedEditor(app, db, outbox);
        await promoteToOwner(db, { spaceId, userId: grace.userId });

        const response = await removeMember(app, {
          accessToken: ada.accessToken,
          spaceId,
          memberId: grace.userId,
        });

        expect(response.status).toBe(204);
        expect(await openOwnersOf(db, spaceId)).toEqual([{ userId: ada.userId }]);
      },
      { mailer: outbox.mailer },
    );
  });

  it("un propriétaire qui se vise lui-même reçoit 409 self-removal et reste membre", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, userId } = await obtainAccessToken(app);
      const spaceId = await personalSpaceOf(db, userId);

      const response = await removeMember(app, { accessToken, spaceId, memberId: userId });

      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        type: SELF_REMOVAL,
        title: "Un membre quitte l'espace par son départ",
        status: 409,
      });
      expect(await membershipsOf(db, { spaceId, userId })).toEqual([
        { role: "owner", closedAt: null, closedReason: null },
      ]);
    }));

  it("un éditeur qui retire un membre reçoit 403, et rien ne change", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { ada, grace, spaceId } = await seedSpaceWithInvitedEditor(app, db, outbox);

        const response = await removeMember(app, {
          accessToken: grace.accessToken,
          spaceId,
          memberId: ada.userId,
        });

        expect(response.status).toBe(403);
        expect(await openOwnersOf(db, spaceId)).toEqual([{ userId: ada.userId }]);
      },
      { mailer: outbox.mailer },
    );
  });

  it("un identifiant d'espace qui n'est pas un UUID répond 404", () =>
    withIdentityApp(async (app) => {
      const { accessToken, userId } = await obtainAccessToken(app);

      const response = await removeMember(app, {
        accessToken,
        spaceId: "pas-un-uuid",
        memberId: userId,
      });

      expect(response.status).toBe(404);
    }));

  it("un identifiant de membre qui n'est pas un UUID répond 404", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, userId } = await obtainAccessToken(app);
      const spaceId = await personalSpaceOf(db, userId);

      const response = await removeMember(app, { accessToken, spaceId, memberId: "pas-un-uuid" });

      expect(response.status).toBe(404);
    }));

  it("un membre déjà retiré répond 404", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { ada, grace, spaceId } = await seedSpaceWithInvitedEditor(app, db, outbox);
        await removeMember(app, { accessToken: ada.accessToken, spaceId, memberId: grace.userId });

        const again = await removeMember(app, {
          accessToken: ada.accessToken,
          spaceId,
          memberId: grace.userId,
        });

        expect(again.status).toBe(404);
        expect(await membershipsOf(db, { spaceId, userId: grace.userId })).toHaveLength(1);
      },
      { mailer: outbox.mailer },
    );
  });

  it("deux propriétaires qui se retirent l'un l'autre en même temps laissent un propriétaire", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { ada, grace, spaceId } = await seedSpaceWithInvitedEditor(app, db, outbox);
        await promoteToOwner(db, { spaceId, userId: grace.userId });

        const responses = await Promise.all([
          removeMember(app, { accessToken: ada.accessToken, spaceId, memberId: grace.userId }),
          removeMember(app, { accessToken: grace.accessToken, spaceId, memberId: ada.userId }),
        ]);

        expect(
          responses.map(({ status }) => status).toSorted((left, right) => left - right),
        ).toEqual([204, 404]);
        expect(await openOwnersOf(db, spaceId)).toHaveLength(1);
      },
      { mailer: outbox.mailer },
    );
  });
});
