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
  return { ada, spaceId, token: tokenOf(outbox.sent.at(-1)) };
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

describe("invitation d'un membre par l'app web, contre la vraie API (ADR 0011, ADR 0017 §1)", () => {
  it("un propriétaire d'un espace Team invite Grace : l'email d'invitation part vers elle", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const ada = await signedInAs(app, ADA);
        const spaceId = await personalSpaceOf(db, ada.userId);
        await switchToTeam(db, spaceId);

        const invited = await ada.spaces.inviteMember({ spaceId, email: GRACE.email });

        expect(invited).toEqual(
          ok({ id: expect.stringMatching(UUID), email: GRACE.email, expiresAt: expect.any(Date) }),
        );
        expect(outbox.sent.at(-1)?.to).toBe(GRACE.email);
      },
      { mailer: outbox.mailer },
    );
  });

  it("un éditeur qui tente d'inviter reçoit forbidden", () =>
    withIdentityApp(async (app, db) => {
      const ada = await signedInAs(app, ADA);
      const spaceId = await seedTeamSpaceWith(db, { userId: ada.userId, role: "editor" });

      expect(await ada.spaces.inviteMember({ spaceId, email: GRACE.email })).toEqual(
        err("forbidden"),
      );
    }));

  it("inviter dans un espace Free donne plan_required", () =>
    withIdentityApp(async (app, db) => {
      const ada = await signedInAs(app, ADA);
      const spaceId = await personalSpaceOf(db, ada.userId);

      expect(await ada.spaces.inviteMember({ spaceId, email: GRACE.email })).toEqual(
        err("plan_required"),
      );
    }));

  it("inviter quelqu'un qui est déjà membre donne already_member", () =>
    withIdentityApp(async (app, db) => {
      const ada = await signedInAs(app, ADA);
      const spaceId = await personalSpaceOf(db, ada.userId);
      await switchToTeam(db, spaceId);

      expect(await ada.spaces.inviteMember({ spaceId, email: ADA.email })).toEqual(
        err("already_member"),
      );
    }));

  it("un email invalide donne invalid_email", () =>
    withIdentityApp(async (app, db) => {
      const ada = await signedInAs(app, ADA);
      const spaceId = await personalSpaceOf(db, ada.userId);
      await switchToTeam(db, spaceId);

      expect(await ada.spaces.inviteMember({ spaceId, email: "pas-un-email" })).toEqual(
        err("invalid_email"),
      );
    }));
});

describe("liste des membres par l'app web, contre la vraie API (ADR 0044 §5)", () => {
  const ADA_AND_GRACE = [
    { userId: expect.stringMatching(UUID), name: ADA.name, email: ADA.email, role: "owner" },
    { userId: expect.stringMatching(UUID), name: GRACE.name, email: GRACE.email, role: "editor" },
  ];

  it("après l'acceptation de Grace, Ada propriétaire voit Ada puis Grace avec leurs rôles", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { ada, spaceId, token } = await invitedGrace(app, db, outbox);
        const grace = await signedInAs(app, GRACE);
        await grace.spaces.acceptInvitation({ token });

        expect(await ada.spaces.listMembers({ spaceId })).toEqual(ok(ADA_AND_GRACE));
      },
      { mailer: outbox.mailer },
    );
  });

  it("Grace éditrice voit la même liste des membres", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { spaceId, token } = await invitedGrace(app, db, outbox);
        const grace = await signedInAs(app, GRACE);
        await grace.spaces.acceptInvitation({ token });

        expect(await grace.spaces.listMembers({ spaceId })).toEqual(ok(ADA_AND_GRACE));
      },
      { mailer: outbox.mailer },
    );
  });

  it("les membres de l'espace personnel d'un autre donnent not_found", () =>
    withIdentityApp(async (app, db) => {
      const { spaces } = await signedInAda(app);
      const graceSpaceId = await personalSpaceOf(db, await signUp(app, makeClientIp(), GRACE));

      expect(await spaces.listMembers({ spaceId: graceSpaceId })).toEqual(err("not_found"));
    }));
});

describe("changement de rôle par l'app web, contre la vraie API (ADR 0017)", () => {
  it("Ada promeut Grace propriétaire : la liste des membres la montre propriétaire", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { ada, spaceId, token } = await invitedGrace(app, db, outbox);
        const grace = await signedInAs(app, GRACE);
        await grace.spaces.acceptInvitation({ token });

        const changed = await ada.spaces.changeRole({
          spaceId,
          memberId: grace.userId,
          role: "owner",
        });

        expect(changed).toEqual(ok({ userId: grace.userId, role: "owner" }));
        const members = await ada.spaces.listMembers({ spaceId });
        expect(members.ok && members.value.map(({ email, role }) => ({ email, role }))).toEqual([
          { email: ADA.email, role: "owner" },
          { email: GRACE.email, role: "owner" },
        ]);
      },
      { mailer: outbox.mailer },
    );
  });

  it("Grace éditrice qui tente de changer le rôle d'Ada reçoit forbidden", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { ada, spaceId, token } = await invitedGrace(app, db, outbox);
        const grace = await signedInAs(app, GRACE);
        await grace.spaces.acceptInvitation({ token });

        expect(
          await grace.spaces.changeRole({ spaceId, memberId: ada.userId, role: "editor" }),
        ).toEqual(err("forbidden"));
      },
      { mailer: outbox.mailer },
    );
  });

  it("Ada, seule propriétaire, qui se rétrograde reçoit last_owner", () =>
    withIdentityApp(async (app, db) => {
      const ada = await signedInAs(app, ADA);
      const spaceId = await personalSpaceOf(db, ada.userId);

      expect(
        await ada.spaces.changeRole({ spaceId, memberId: ada.userId, role: "editor" }),
      ).toEqual(err("last_owner"));
    }));
});

const graceJoined = async (
  app: App,
  db: Parameters<typeof personalSpaceOf>[0],
  outbox: ReturnType<typeof makeOutbox>,
) => {
  const { ada, spaceId, token } = await invitedGrace(app, db, outbox);
  const grace = await signedInAs(app, GRACE);
  await grace.spaces.acceptInvitation({ token });
  return { ada, grace, spaceId };
};

describe("retrait d'un membre par l'app web, contre la vraie API (ADR 0017 §2)", () => {
  it("Ada propriétaire retire Grace : Grace n'est plus dans la liste des membres", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { ada, grace, spaceId } = await graceJoined(app, db, outbox);

        const removed = await ada.spaces.removeMember({ spaceId, memberId: grace.userId });

        expect(removed).toEqual(ok(undefined));
        const members = await ada.spaces.listMembers({ spaceId });
        expect(members.ok && members.value.map(({ email }) => email)).toEqual([ADA.email]);
      },
      { mailer: outbox.mailer },
    );
  });

  it("Grace éditrice qui tente de retirer Ada reçoit forbidden", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { ada, grace, spaceId } = await graceJoined(app, db, outbox);

        expect(await grace.spaces.removeMember({ spaceId, memberId: ada.userId })).toEqual(
          err("forbidden"),
        );
      },
      { mailer: outbox.mailer },
    );
  });

  it("Ada qui se retire elle-même reçoit self_removal", () => {
    const outbox = makeOutbox();
    return withIdentityApp(
      async (app, db) => {
        const { ada, spaceId } = await graceJoined(app, db, outbox);

        expect(await ada.spaces.removeMember({ spaceId, memberId: ada.userId })).toEqual(
          err("self_removal"),
        );
      },
      { mailer: outbox.mailer },
    );
  });
});
