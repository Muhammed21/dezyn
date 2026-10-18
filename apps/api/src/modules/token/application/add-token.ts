import { err, ok, type Result } from "@repo/result";

import type { HistoryWriter } from "../../history/contracts/history-writer.ts";
import type { ProjectFinder } from "../../project/contracts/project.ts";
import { can, type MembershipReader } from "../../space/contracts/membership.ts";
import { type ModeRefusal, modeRefusals } from "../domain/mode-completeness.ts";
import type { Token, TokenDefinition } from "../domain/token.ts";

export type ProjectMode = { readonly id: string; readonly name: string };

export interface ModeReader {
  modesOf(projectId: string): Promise<readonly ProjectMode[]>;
}

export type ModeValue = { readonly modeId: string | null; readonly value: unknown };

export interface TokenWriter {
  create(token: Token, values: readonly ModeValue[]): Promise<"created" | "name_taken">;
}

export interface TokenUnitOfWork {
  run<T>(
    work: (unit: { readonly tokens: TokenWriter; readonly history: HistoryWriter }) => Promise<T>,
  ): Promise<T>;
}

export type InvalidModes = {
  readonly code: "invalid_modes";
  readonly refusals: readonly ModeRefusal[];
};

export type TokenAdditionFailure = "not_found" | "name_taken" | InvalidModes;

const valuesOf = (
  { $value, modes }: TokenDefinition,
  projectModes: readonly ProjectMode[],
): readonly ModeValue[] =>
  modes === undefined
    ? [{ modeId: null, value: $value }]
    : projectModes.map(({ id, name }) => ({ modeId: id, value: modes[name] }));

export const addToken =
  ({
    projects,
    memberships,
    modes,
    unitOfWork,
    newId,
    now,
  }: {
    readonly projects: ProjectFinder;
    readonly modes: ModeReader;
    readonly memberships: MembershipReader;
    readonly unitOfWork: TokenUnitOfWork;
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
  }): Promise<Result<Token, TokenAdditionFailure>> => {
    const project = await projects.find(projectId);
    if (project === undefined) {
      return err("not_found");
    }
    const membership = await memberships.activeMembership({ spaceId: project.spaceId, userId });
    if (!can({ membership, action: "token.create" })) {
      return err("not_found");
    }
    const projectModes = await modes.modesOf(projectId);
    const refusals = modeRefusals({
      projectModes: projectModes.map(({ name }) => name),
      sent: {
        value: token.$value !== undefined,
        modes: token.modes === undefined ? undefined : Object.keys(token.modes),
      },
    });
    if (refusals.length > 0) {
      return err({ code: "invalid_modes", refusals });
    }
    const added: Token = {
      ...token,
      id: newId(),
      projectId,
      status: "validated",
      createdAt: now(),
    };
    return unitOfWork.run(async ({ tokens, history }) => {
      if ((await tokens.create(added, valuesOf(token, projectModes))) === "name_taken") {
        return err("name_taken");
      }
      await history.append({
        spaceId: project.spaceId,
        projectId,
        action: "token.created",
        userId,
        clientId: null,
        before: null,
        after: token,
        correlationId,
        occurredAt: added.createdAt,
      });
      return ok(added);
    });
  };

export type TokenUseCases = {
  readonly addToken: ReturnType<typeof addToken>;
};
