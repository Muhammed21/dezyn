import type { HistoryWriter } from "#modules/history/contracts/history-writer.ts";
import type { ProjectAccess } from "#modules/space/contracts/membership.ts";
import type {
  DecidedStorageAlert,
  StorageAlertDecision,
  StorageAlertSender,
} from "#modules/space/contracts/storage-alert.ts";
import { err, ok, type Result } from "@repo/result";

import { groupConflict } from "../domain/token-name.ts";
import type { Token, TokenDefinition } from "../domain/token.ts";
import {
  checkedValues,
  type InvalidModes,
  type InvalidReferences,
  type ModeReader,
  modeValueOf,
  type ProjectTokenReader,
  type TokenWriter,
} from "./token-values.ts";

export type ReplacedProposal = { readonly id: string; readonly batchId: string };

export interface PendingProposals {
  replace(token: {
    readonly projectId: string;
    readonly name: string;
  }): Promise<ReplacedProposal | null>;
  pendingNamesOf(projectId: string): Promise<readonly string[]>;
}

export interface TokenUnitOfWork {
  run<T>(
    work: (unit: {
      readonly tokens: TokenWriter;
      readonly history: HistoryWriter;
      readonly proposals: PendingProposals;
      readonly storageAlert: StorageAlertDecision;
    }) => Promise<T>,
  ): Promise<T>;
}

export type AddedToken = Token & { readonly replaced: ReplacedProposal | null };

export type NameConflict = { readonly code: "name_conflict"; readonly other: string };

export type TokenAdditionFailure =
  | "not_found"
  | "name_taken"
  | NameConflict
  | InvalidModes
  | InvalidReferences;

export const addToken =
  ({
    access,
    modes,
    projectTokens,
    unitOfWork,
    sendStorageAlert,
    newId,
    now,
  }: {
    readonly access: ProjectAccess;
    readonly modes: ModeReader;
    readonly projectTokens: ProjectTokenReader;
    readonly unitOfWork: TokenUnitOfWork;
    readonly sendStorageAlert: StorageAlertSender;
    readonly newId: () => string;
    readonly now: () => Date;
  }) =>
  async ({
    projectId,
    userId,
    token,
    correlationId,
  }: {
    readonly projectId: string;
    readonly userId: string;
    readonly token: TokenDefinition;
    readonly correlationId: string;
  }): Promise<Result<AddedToken, TokenAdditionFailure>> => {
    const project = await access({ projectId, userId, action: "token.create" });
    if (project === undefined) {
      return err("not_found");
    }
    const existing = await projectTokens.tokensOf(projectId);
    const checked = checkedValues(token, {
      projectModes: await modes.modesOf(projectId),
      tokens: existing,
    });
    if (!checked.ok) {
      return checked;
    }
    const values = checked.value;
    const added: Token = {
      ...token,
      id: newId(),
      projectId,
      status: "validated",
      createdAt: now(),
    };
    const result = await unitOfWork.run(
      async ({
        tokens,
        history,
        proposals,
        storageAlert,
      }): Promise<
        Result<
          { readonly token: AddedToken; readonly alert: DecidedStorageAlert | undefined },
          TokenAdditionFailure
        >
      > => {
        const other = groupConflict(token.name, [
          ...existing.map(({ name }) => name),
          ...(await proposals.pendingNamesOf(projectId)),
        ]);
        if (other !== undefined) {
          return err({ code: "name_conflict", other });
        }
        if ((await tokens.create(added, values.map(modeValueOf))) === "name_taken") {
          return err("name_taken");
        }
        const replaced = await proposals.replace({ projectId, name: token.name });
        await history.append({
          spaceId: project.spaceId,
          projectId,
          action: "token.created",
          userId,
          clientId: null,
          before: null,
          after: { ...token, replaced },
          correlationId,
          occurredAt: added.createdAt,
        });
        return ok({
          token: { ...added, replaced },
          alert: await storageAlert(project.spaceId),
        });
      },
    );
    if (!result.ok) {
      return result;
    }
    if (result.value.alert !== undefined) {
      await sendStorageAlert(result.value.alert);
    }
    return ok(result.value.token);
  };
