import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

import { err, ok, type Result } from "@repo/result";

import type { InvitationFailure, SentInvitation } from "../../domain/space.ts";
import { inviteMemberForm } from "../invite-member.tsx";

const SPACE_ID = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";
const GRACE_EMAIL = "grace@dezyn.test";

type InviteMember = (invitation: {
  readonly spaceId: string;
  readonly email: string;
}) => Promise<Result<SentInvitation, InvitationFailure>>;

const sentTo = (email: string): SentInvitation => ({
  id: "2c5d6e7f-8a9b-4f2a-9c1e-7b3d4e8a9f10",
  email,
  expiresAt: new Date("2026-11-21T10:00:00.000Z"),
});

const renderInviteMember = async (inviteMember: InviteMember) => {
  const InviteMember = inviteMemberForm({ inviteMember });
  const root = createRootRoute();
  const spacePage = createRoute({
    getParentRoute: () => root,
    path: "/espaces/$spaceId",
    component: function SpacePage() {
      return <InviteMember spaceId={spacePage.useParams().spaceId} />;
    },
  });
  const signIn = createRoute({
    getParentRoute: () => root,
    path: "/connexion",
    component: () => <p>Page de connexion</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([spacePage, signIn]),
    history: createMemoryHistory({ initialEntries: [`/espaces/${SPACE_ID}`] }),
  });
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
};

type Screen = Awaited<ReturnType<typeof renderInviteMember>>;

const emailField = (screen: Screen) => screen.getByLabelText("Email");
const inviteButton = (screen: Screen) => screen.getByRole("button", { name: "Inviter" });

const invite = async (screen: Screen, email: string) => {
  await emailField(screen).fill(email);
  await inviteButton(screen).click();
};

describe("formulaire d'invitation d'un membre (ADR 0011, ADR 0017 §1)", () => {
  it("invite l'email saisi dans l'espace de la page, annonce l'envoi et vide le champ", async () => {
    const invited: { spaceId: string; email: string }[] = [];
    const screen = await renderInviteMember((invitation) => {
      invited.push(invitation);
      return Promise.resolve(ok(sentTo(invitation.email)));
    });

    await expect.element(screen.getByRole("heading", { name: "Inviter un membre" })).toBeVisible();
    await invite(screen, GRACE_EMAIL);

    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent(`Invitation envoyée à ${GRACE_EMAIL}.`);
    await expect.element(emailField(screen)).toHaveValue("");
    expect(invited).toEqual([{ spaceId: SPACE_ID, email: GRACE_EMAIL }]);
  });

  it("s'ouvre sur un champ Email vide, sans message", async () => {
    const screen = await renderInviteMember(() => Promise.resolve(ok(sentTo(GRACE_EMAIL))));

    await expect.element(emailField(screen)).toHaveValue("");
    expect(screen.getByRole("status").query()).toBeNull();
    expect(screen.getByRole("alert").query()).toBeNull();
  });

  it("n'envoie pas un email mal formé", async () => {
    const invited: string[] = [];
    const screen = await renderInviteMember(({ email }) => {
      invited.push(email);
      return Promise.resolve(ok(sentTo(email)));
    });

    await invite(screen, "pas-un-email");

    await expect.element(emailField(screen)).toHaveValue("pas-un-email");
    expect(invited).toEqual([]);
  });

  it("désactive le bouton pendant l'envoi", async () => {
    const screen = await renderInviteMember(() => new Promise(() => {}));

    await invite(screen, GRACE_EMAIL);

    await expect.element(inviteButton(screen)).toBeDisabled();
  });

  it.each([
    ["invalid_email", "Saisissez un email valide."],
    ["already_member", "Cette personne est déjà membre de l'espace."],
    ["plan_required", "Cet espace doit passer au plan Team pour inviter un membre."],
    ["forbidden", "Vous n'avez pas le droit d'inviter dans cet espace."],
    ["not_found", "Cet espace est introuvable."],
    ["unavailable", "L'invitation est indisponible pour le moment."],
    ["invalid_response", "L'invitation est indisponible pour le moment."],
  ] as const)("annonce l'échec %s et garde l'email saisi", async (failure, message) => {
    const screen = await renderInviteMember(() => Promise.resolve(err(failure)));

    await invite(screen, GRACE_EMAIL);

    await expect.element(screen.getByRole("alert")).toHaveTextContent(message);
    await expect.element(emailField(screen)).toHaveValue(GRACE_EMAIL);
    await expect.element(inviteButton(screen)).toBeEnabled();
    expect(screen.getByRole("status").query()).toBeNull();
  });

  it("efface l'échec précédent quand une invitation suivante réussit", async () => {
    const answers: Result<SentInvitation, InvitationFailure>[] = [
      err("already_member"),
      ok(sentTo("alan@dezyn.test")),
    ];
    const screen = await renderInviteMember(() =>
      Promise.resolve(answers.shift() ?? err("unavailable")),
    );

    await invite(screen, GRACE_EMAIL);
    await expect.element(screen.getByRole("alert")).toBeVisible();
    await invite(screen, "alan@dezyn.test");

    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent("Invitation envoyée à alan@dezyn.test.");
    expect(screen.getByRole("alert").query()).toBeNull();
  });

  it("renvoie vers la connexion quand le membre n'a plus de session", async () => {
    const screen = await renderInviteMember(() => Promise.resolve(err("unauthenticated")));

    await invite(screen, GRACE_EMAIL);

    await expect.element(screen.getByText("Page de connexion")).toBeVisible();
  });
});
