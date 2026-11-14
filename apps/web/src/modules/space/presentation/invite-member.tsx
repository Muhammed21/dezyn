import { useMutation } from "@tanstack/react-query";
import { Navigate } from "@tanstack/react-router";
import { type SubmitEvent, useState } from "react";

import type { Result } from "@repo/result";

import type { InvitationFailure, SentInvitation } from "../domain/space.ts";

type InviteMember = (invitation: {
  readonly spaceId: string;
  readonly email: string;
}) => Promise<Result<SentInvitation, InvitationFailure>>;

const UNAVAILABLE = "L'invitation est indisponible pour le moment.";

const INVITATION_MESSAGES: Readonly<Record<Exclude<InvitationFailure, "unauthenticated">, string>> =
  {
    invalid_email: "Saisissez un email valide.",
    already_member: "Cette personne est déjà membre de l'espace.",
    plan_required: "Cet espace doit passer au plan Team pour inviter un membre.",
    forbidden: "Vous n'avez pas le droit d'inviter dans cet espace.",
    not_found: "Cet espace est introuvable.",
    unavailable: UNAVAILABLE,
    invalid_response: UNAVAILABLE,
  };

const InvitationOutcome = ({
  result,
}: {
  readonly result: Result<SentInvitation, InvitationFailure>;
}) => {
  if (result.ok) {
    return <p role="status">Invitation envoyée à {result.value.email}.</p>;
  }
  return result.error === "unauthenticated" ? (
    <Navigate to="/connexion" />
  ) : (
    <p role="alert">{INVITATION_MESSAGES[result.error]}</p>
  );
};

export const inviteMemberForm = ({ inviteMember }: { readonly inviteMember: InviteMember }) =>
  function InviteMember({ spaceId }: { readonly spaceId: string }) {
    const [email, setEmail] = useState("");
    const { data, isPending, mutate } = useMutation({
      mutationFn: inviteMember,
      onSuccess: (result) => {
        if (result.ok) {
          setEmail("");
        }
      },
    });
    const onSubmit = (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      mutate({ spaceId, email });
    };
    return (
      <section aria-labelledby="inviter-un-membre">
        <h2 id="inviter-un-membre">Inviter un membre</h2>
        <form onSubmit={onSubmit}>
          <label>
            Email
            <input
              type="email"
              name="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <button type="submit" disabled={isPending}>
            Inviter
          </button>
        </form>
        {!isPending && data !== undefined && <InvitationOutcome result={data} />}
      </section>
    );
  };
