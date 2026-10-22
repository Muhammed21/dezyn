import type { HistoryWriter } from "#modules/history/contracts/history-writer.ts";
import type { ProjectAccess } from "#modules/space/contracts/membership.ts";
import type { StorageAlert } from "#modules/space/contracts/storage-alert.ts";
import { err, ok, type Result } from "@repo/result";

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
}

export interface TokenUnitOfWork {
  run<T>(
    work: (unit: {
      readonly tokens: TokenWriter;
      readonly history: HistoryWriter;
      readonly proposals: PendingProposals;
    }) => Promise<T>,
  ): Promise<T>;
}

export type AddedToken = Token & { readonly replaced: ReplacedProposal | null };

export type TokenAdditionFailure = "not_found" | "name_taken" | InvalidModes | InvalidReferences;

export const addToken =
  ({
    access,
    modes,
    projectTokens,
    unitOfWork,
    alertStorage,
    newId,
    now,
  }: {
    readonly access: ProjectAccess;
    readonly modes: ModeReader;
    readonly projectTokens: ProjectTokenReader;
    readonly unitOfWork: TokenUnitOfWork;
    readonly alertStorage: StorageAlert;
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
    const checked = checkedValues(token, {
      projectModes: await modes.modesOf(projectId),
      tokens: await projectTokens.tokensOf(projectId),
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
    const result = await unitOfWork.run<Result<AddedToken, TokenAdditionFailure>>(
      async ({ tokens, history, proposals }) => {
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
        return ok({ ...added, replaced });
      },
    );
    if (result.ok) {
      await alertStorage(project.spaceId);
    }
    return result;
  };
