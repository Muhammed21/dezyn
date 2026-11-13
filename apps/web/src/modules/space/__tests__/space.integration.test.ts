import { describe, expect, it } from "vitest";

import {
  ADA,
  type App,
  BASE_URL,
  GRACE,
  makeClientIp,
  signUp,
  withIdentityApp,
} from "@repo/api/testing/authorization-flow.ts";
import {
  makeOutbox,
  personalSpaceOf,
  seedTeamSpaceWith,
  switchToTeam,
  tokenOf,
} from "@repo/api/testing/space-fixtures.ts";
import { err, ok } from "@repo/result";

import { makeApiBrowser } from "../../../testing/api-browser.ts";
import { createSpaces } from "../space-module.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("espaces du membre dans l'app web, contre la vraie API (ADR 0044 §6)", () => {
  it("un membre connecté retrouve son espace personnel", () =>
    withIdentityApp(async (app) => {
      const ip = makeClientIp();
      await signUp(app, ip);
      const fetch = makeApiBrowser(app, { ip });
      await fetch(`${BASE_URL}/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: ADA.email, password: ADA.password }),
      });

      const spaces = await createSpaces({ apiUrl: BASE_URL, fetch }).listMySpaces();

      expect(spaces).toEqual(
        ok([
          {
            id: expect.stringMatching(UUID),
            name: ADA.name,
            plan: "free",
            role: "owner",
            allowedActions: expect.arrayContaining(["project.create", "member.invite"]),
          },
        ]),
      );
    }));

  it("sans session, la liste donne unauthenticated", () =>
    withIdentityApp(async (app) => {
      const fetch = makeApiBrowser(app, { ip: makeClientIp() });

      expect(await createSpaces({ apiUrl: BASE_URL, fetch }).listMySpaces()).toEqual(
        err("unauthenticated"),
      );
    }));
});

const signedInAda = async (app: App) => {
  const ip = makeClientIp();
  const userId = await signUp(app, ip);
  const fetch = makeApiBrowser(app, { ip });
  await fetch(`${BASE_URL}/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: ADA.email, password: ADA.password }),
  });
  return { userId, spaces: createSpaces({ apiUrl: BASE_URL, fetch }) };
};

describe("lecture d'un espace par l'app web, contre la vraie API (ADR 0044 §5)", () => {
  it("le propriétaire lit son espace, avec project.create", () =>
    withIdentityApp(async (app, db) => {
      const { userId, spaces } = await signedInAda(app);
      const spaceId = await personalSpaceOf(db, userId);

      const read = await spaces.readSpace({ spaceId });

      expect(read).toEqual(ok(expect.objectContaining({ id: spaceId, role: "owner" })));
      expect(read.ok && read.value.allowedActions).toContain("project.create");
    }));

  it("un éditeur lit l'espace d'équipe sans project.create", () =>
    withIdentityApp(async (app, db) => {
      const { userId, spaces } = await signedInAda(app);
      const spaceId = await seedTeamSpaceWith(db, { userId, role: "editor" });

      const read = await spaces.readSpace({ spaceId });

      expect(read).toEqual(ok(expect.objectContaining({ id: spaceId, role: "editor" })));
      expect(read.ok && read.value.allowedActions).toContain("proposal.review");
      expect(read.ok && read.value.allowedActions).not.toContain("project.create");
    }));

  it("l'espace personnel d'un autre membre donne not_found", () =>
    withIdentityApp(async (app, db) => {
      const { spaces } = await signedInAda(app);
      const graceSpaceId = await personalSpaceOf(db, await signUp(app, makeClientIp(), GRACE));

      expect(await spaces.readSpace({ spaceId: graceSpaceId })).toEqual(err("not_found"));
    }));
});

const ALAN = {
  name: "Alan Turing",
  email: "alan@dezyn.test",
  password: "encore-un-mot-de-passe-solide",
};

const signedInAs = async (app: App, user: typeof ADA) => {
  const ip = makeClientIp();
  const userId = await signUp(app, ip, user);
  const fetch = makeApiBrowser(app, { ip });
  await fetch(`${BASE_URL}/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: user.email, password: user.password }),
  });
  return { userId, spaces: createSpaces({ apiUrl: BASE_URL, fetch }), fetch };
};

const invitedGrace = async (
  app: App,
  db: Parameters<typeof personalSpaceOf>[0],
  outbox: ReturnType<typeof makeOutbox>,
) => {
  const ada = await signedInAs(app, ADA);
  const spaceId = await personalSpaceOf(db, ada.userId);
  await switchToTeam(db, spaceId);
  await ada.fetch(`${BASE_URL}/v1/spaces/${spaceId}/invitations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: GRACE.email }),
  });
  return { spaceId, token: tokenOf(outbox.sent.at(-1)) };
};

describe("acceptation d'une invitation par l'app web, contre la vraie API (ADR 0011, ADR 0044 §6)", () => {
  it("Grace accepte l'invitation d'Ada : l'espace rejoint apparaît dans ses espaces, en éditrice", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { spaceId, token } = await invitedGrace(app, db, outbox);
        const grace = await signedInAs(app, GRACE);

        const accepted = await grace.spaces.acceptInvitation({ token });

        expect(accepted).toEqual(
          ok({
            id: spaceId,
            name: ADA.name,
            plan: "team",
            role: "editor",
            allowedActions: expect.arrayContaining(["space.read"]),
          }),
        );
        const mine = await grace.spaces.listMySpaces();
        expect(mine.ok && mine.value.map(({ id, role }) => ({ id, role }))).toContainEqual({
          id: spaceId,
          role: "editor",
        });
      },
      { mailer: outbox.mailer },
    );
  });

  it("une seconde acceptation du même lien donne gone", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { token } = await invitedGrace(app, db, outbox);
        const grace = await signedInAs(app, GRACE);
        await grace.spaces.acceptInvitation({ token });

        expect(await grace.spaces.acceptInvitation({ token })).toEqual(err("gone"));
      },
      { mailer: outbox.mailer },
    );
  });

  it("un autre utilisateur que l'invitée reçoit email_mismatch", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { token } = await invitedGrace(app, db, outbox);
        const alan = await signedInAs(app, ALAN);

        expect(await alan.spaces.acceptInvitation({ token })).toEqual(err("email_mismatch"));
      },
      { mailer: outbox.mailer },
    );
  });
});
