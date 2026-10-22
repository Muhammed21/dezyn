import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { PostgresDatabase } from "#db";
import type { LogSink } from "#platform/logging.ts";
import type { Mailer } from "#platform/mailer.ts";

import { acceptInvitation } from "./application/accept-invitation.ts";
import { alertStorage } from "./application/alert-storage.ts";
import { inviteMember } from "./application/invite-member.ts";
import { leaveSpace } from "./application/leave-space.ts";
import { changeRole, removeMember } from "./application/manage-members.ts";
import { projectAccess } from "./application/project-access.ts";
import { readSpace } from "./application/read-space.ts";
import { createPersonalSpace, listMySpaces } from "./application/spaces.ts";
import type { ProjectLocator } from "./domain/project-access.ts";
import { postgresDepartures } from "./infrastructure/postgres-departures.ts";
import { postgresInvitationAcceptance } from "./infrastructure/postgres-invitation-acceptance.ts";
import { postgresInvitationStore } from "./infrastructure/postgres-invitation-store.ts";
import { postgresMemberDirectory } from "./infrastructure/postgres-member-directory.ts";
import { postgresMemberManagement } from "./infrastructure/postgres-member-management.ts";
import { postgresMembershipReader } from "./infrastructure/postgres-membership-reader.ts";
import { postgresSpaceStore } from "./infrastructure/postgres-space-store.ts";
import { postgresStorageAlerts } from "./infrastructure/postgres-storage-alerts.ts";

const now = () => new Date();

const newToken = () => randomBytes(32).toString("base64url");

const hashToken = (token: string) => createHash("sha256").update(token).digest("base64url");

export const spaceModule = ({
  db,
  mailer,
  webUrl,
  log,
}: {
  readonly db: PostgresDatabase;
  readonly mailer: Mailer;
  readonly webUrl: string;
  readonly log: LogSink;
}) => {
  const store = postgresSpaceStore(db);
  const memberships = postgresMembershipReader(db);
  return {
    memberships,
    projectAccess: (projects: ProjectLocator) => projectAccess({ projects, memberships }),
    createPersonalSpace: createPersonalSpace({ store, newId: randomUUID, now }),
    listMySpaces: listMySpaces({ store }),
    alertStorage: alertStorage({ alerts: postgresStorageAlerts(db), mailer, now, log }),
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
    changeRole: changeRole({ management: postgresMemberManagement(db), newId: randomUUID, now }),
    removeMember: removeMember({ management: postgresMemberManagement(db), now }),
  };
};
