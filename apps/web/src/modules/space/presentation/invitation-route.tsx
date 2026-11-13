import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type AnyRootRoute, createRoute, Navigate, useNavigate } from "@tanstack/react-router";

import type { Result } from "@repo/result";

import type { AcceptanceFailure, Space } from "../domain/space.ts";

type AcceptInvitation = (invitation: {
  readonly token: string;
}) => Promise<Result<Space, AcceptanceFailure>>;

const ACCEPTANCE_MESSAGES: Readonly<Record<Exclude<AcceptanceFailure, "unauthenticated">, string>> =
  {
    gone: "Cette invitation a expiré ou a déjà servi.",
    email_mismatch: "Cette invitation est adressée à un autre email.",
    already_member: "Vous êtes déjà membre de cet espace.",
    plan_required: "Cet espace doit passer au plan Team pour accueillir un membre.",
    unavailable: "L'acceptation est indisponible pour le moment.",
    invalid_response: "L'acceptation est indisponible pour le moment.",
  };

const AcceptanceRefusal = ({ failure }: { readonly failure: AcceptanceFailure }) =>
  failure === "unauthenticated" ? (
    <Navigate to="/connexion" />
  ) : (
    <p role="alert">{ACCEPTANCE_MESSAGES[failure]}</p>
  );

const Invitation = ({
  token,
  acceptInvitation,
}: {
  readonly token: string;
  readonly acceptInvitation: AcceptInvitation;
}) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isPending, mutate } = useMutation({
    mutationFn: acceptInvitation,
    onSuccess: async (result) => {
      if (result.ok) {
        await queryClient.invalidateQueries({ queryKey: ["my-spaces"] });
        await navigate({ to: "/espaces/$spaceId", params: { spaceId: result.value.id } });
      }
    },
  });
  return (
    <main>
      <h1>Vous êtes invité à rejoindre un espace</h1>
      <button type="button" disabled={isPending} onClick={() => mutate({ token })}>
        Accepter l'invitation
      </button>
      {!isPending && data?.ok === false ? <AcceptanceRefusal failure={data.error} /> : null}
    </main>
  );
};

export const invitationRoute = ({
  parent,
  acceptInvitation,
}: {
  readonly parent: AnyRootRoute;
  readonly acceptInvitation: AcceptInvitation;
}) => {
  const route = createRoute({
    getParentRoute: () => parent,
    path: "/invitations/$token",
    component: function InvitationPage() {
      const { token } = route.useParams();
      return <Invitation token={token} acceptInvitation={acceptInvitation} />;
    },
  });
  return route;
};
