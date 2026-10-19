import { err, ok, type Result } from "@repo/result";

import type { HistoryWriter } from "../../history/contracts/history-writer.ts";
import type { ProjectFinder } from "../../project/contracts/project.ts";
import { can, type MembershipReader } from "../../space/contracts/membership.ts";
import { type ModeRefusal, modeRefusals } from "../domain/mode-completeness.ts";
import {
  aliasName,
  type ProjectToken,
  type ReferenceRefusal,
  resolveReference,
  type WrittenToken,
} from "../domain/reference.ts";
import type { Token, TokenDefinition } from "../domain/token.ts";

export type ProjectMode = { readonly id: string; readonly name: string };

export interface ModeReader {
  modesOf(projectId: string): Promise<readonly ProjectMode[]>;
}

export interface ProjectTokenReader {
  tokensOf(projectId: string): Promise<readonly ProjectToken[]>;
}

export type ModeValue = {
  readonly modeId: string | null;
  readonly value: unknown;
  readonly referencedTokenId: string | null;
};

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

export type InvalidReferences = {
  readonly code: "invalid_references";
  readonly refusals: readonly { readonly mode?: string; readonly refusal: ReferenceRefusal }[];
};

export type TokenAdditionFailure = "not_found" | "name_taken" | InvalidModes | InvalidReferences;

type PlacedValue = { readonly mode?: ProjectMode; readonly value: unknown };

const placedValuesOf = (
  { $value, modes }: TokenDefinition,
  projectModes: readonly ProjectMode[],
): readonly PlacedValue[] =>
  modes === undefined
    ? [{ value: $value }]
    : projectModes.map((mode) => ({ mode, value: modes[mode.name] }));

type Resolved = PlacedValue & {
  readonly resolution: ReturnType<typeof resolveReference> | undefined;
};

const resolved = (
  placed: readonly PlacedValue[],
  {
    $type,
    tokens,
    written,
  }: {
    readonly $type: string;
    readonly tokens: readonly ProjectToken[];
    readonly written: readonly WrittenToken[];
  },
): readonly Resolved[] =>
  placed.map((value) => ({
    ...value,
    resolution:
      typeof value.value === "string"
        ? resolveReference({ name: aliasName(value.value) ?? "", $type, tokens, written })
        : undefined,
  }));

const referenceRefusalsOf = (values: readonly Resolved[]): InvalidReferences["refusals"] =>
  values.flatMap(({ mode, resolution }) =>
    resolution !== undefined && "refusal" in resolution
      ? [{ ...(mode === undefined ? {} : { mode: mode.name }), refusal: resolution.refusal }]
      : [],
  );

const modeValueOf = ({ mode, value, resolution }: Resolved): ModeValue => {
  const referencedTokenId =
    resolution !== undefined && "tokenId" in resolution ? resolution.tokenId : null;
  return {
    modeId: mode?.id ?? null,
    value: referencedTokenId === null ? value : null,
    referencedTokenId,
  };
};

export const checkedValues = (
  token: TokenDefinition,
  {
    projectModes,
    tokens,
    written,
  }: {
    readonly projectModes: readonly ProjectMode[];
    readonly tokens: readonly ProjectToken[];
    readonly written: readonly WrittenToken[];
  },
): Result<readonly Resolved[], InvalidModes | InvalidReferences> => {
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
  const values = resolved(placedValuesOf(token, projectModes), {
    $type: token.$type,
    tokens,
    written,
  });
  const referenceRefusals = referenceRefusalsOf(values);
  if (referenceRefusals.length > 0) {
    return err({ code: "invalid_references", refusals: referenceRefusals });
  }
  return ok(values);
};

export const addToken =
  ({
    projects,
    memberships,
    modes,
    projectTokens,
    unitOfWork,
    newId,
    now,
  }: {
    readonly projects: ProjectFinder;
    readonly modes: ModeReader;
    readonly projectTokens: ProjectTokenReader;
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
    const checked = checkedValues(token, {
      projectModes: await modes.modesOf(projectId),
      tokens: await projectTokens.tokensOf(projectId),
      written: [],
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
    return unitOfWork.run(async ({ tokens, history }) => {
      if ((await tokens.create(added, values.map(modeValueOf))) === "name_taken") {
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
