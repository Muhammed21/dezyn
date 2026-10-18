import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { Mailer } from "../../platform/mailer.ts";
import type { PostgresDatabase } from "../../platform/postgres-database.ts";
import { acceptInvitation } from "./application/accept-invitation.ts";
import { inviteMember } from "./application/invite-member.ts";
import { leaveSpace } from "./application/leave-space.ts";
import { readSpace } from "./application/read-space.ts";
import { createPersonalSpace, listMySpaces } from "./application/spaces.ts";
import { postgresDepartures } from "./infrastructure/postgres-departures.ts";
import { postgresInvitationAcceptance } from "./infrastructure/postgres-invitation-acceptance.ts";
import { postgresInvitationStore } from "./infrastructure/postgres-invitation-store.ts";
import { postgresMemberDirectory } from "./infrastructure/postgres-member-directory.ts";
import { postgresMembershipReader } from "./infrastructure/postgres-membership-reader.ts";
import { postgresSpaceStore } from "./infrastructure/postgres-space-store.ts";

const now = () => new Date();

const newToken = () => randomBytes(32).toString("base64url");

const hashToken = (token: string) => createHash("sha256").update(token).digest("base64url");

export const spaceModule = ({
  db,
  mailer,
  webUrl,
}: {
  readonly db: PostgresDatabase;
  readonly mailer: Mailer;
  readonly webUrl: string;
}) => {
  const store = postgresSpaceStore(db);
  const memberships = postgresMembershipReader(db);
  return {
    memberships,
    createPersonalSpace: createPersonalSpace({ store, newId: randomUUID, now }),
    listMySpaces: listMySpaces({ store }),
    readSpace: readSpace({ memberships, spaces: store }),
    inviteMember: inviteMember({
      memberships,
      spaces: store,
      members: postgresMemberDirectory(db),
      invitations: postgresInvitationStore(db),
      mailer,
      newId: randomUUID,
      newToken,
      hashToken,
      now,
      webUrl,
    }),
    acceptInvitation: acceptInvitation({
      acceptance: postgresInvitationAcceptance(db),
      hashToken,
      newId: randomUUID,
      now,
    }),
    leaveSpace: leaveSpace({ departures: postgresDepartures(db), now }),
  };
};
