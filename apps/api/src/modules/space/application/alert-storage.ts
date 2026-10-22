import type { LogSink } from "#platform/logging.ts";
import type { Mailer } from "#platform/mailer.ts";

import type { Plan } from "../domain/space.ts";
import {
  type DecidedStorageAlert,
  type ProjectStorage,
  storageWarningOf,
} from "../domain/storage-warning.ts";

export type SpaceStorage = {
  readonly name: string;
  readonly plan: Plan;
  readonly projects: readonly ProjectStorage[];
};

export interface StorageAlerts {
  storageOf(spaceId: string): Promise<SpaceStorage>;
  markAlerted(request: { readonly spaceId: string; readonly at: Date }): Promise<boolean>;
  clearAlert(spaceId: string): Promise<void>;
  openOwnerEmailsOf(spaceId: string): Promise<readonly string[]>;
}

export const decideStorageAlert =
  ({ alerts, now }: { readonly alerts: StorageAlerts; readonly now: () => Date }) =>
  async (spaceId: string): Promise<DecidedStorageAlert | undefined> => {
    const { name, plan, projects } = await alerts.storageOf(spaceId);
    const warning = storageWarningOf({ spaceName: name, plan, projects });
    if (warning === undefined) {
      await alerts.clearAlert(spaceId);
      return undefined;
    }
    if (!(await alerts.markAlerted({ spaceId, at: now() }))) {
      return undefined;
    }
    return { spaceId, warning, owners: await alerts.openOwnerEmailsOf(spaceId) };
  };

export const sendStorageAlert =
  ({ mailer, log }: { readonly mailer: Mailer; readonly log: LogSink }) =>
  async ({ spaceId, warning, owners }: DecidedStorageAlert): Promise<void> => {
    await Promise.all(
      owners.map(async (to) => {
        const sent = await mailer.send({ to, ...warning });
        if (!sent.ok) {
          log({ level: "error", msg: "storage_alert_unsent", spaceId, to, error: sent.error });
        }
      }),
    );
  };
