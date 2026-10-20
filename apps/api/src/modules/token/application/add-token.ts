import type { HistoryWriter } from "#modules/history/contracts/history-writer.ts";
import type { ProjectAccess } from "#modules/space/contracts/membership.ts";
import { err, ok, type Result } from "@repo/result";

import { fieldAliases } from "../domain/field-references.ts";
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

export type FieldReference = { readonly field: string; readonly referencedTokenId: string };

export type ModeValue = {
  readonly modeId: string | null;
  readonly value: unknown;
  readonly referencedTokenId: string | null;
  readonly fieldReferences: readonly FieldReference[];
};

export interface TokenWriter {
  create(token: Token, values: readonly ModeValue[]): Promise<"created" | "name_taken">;
  replace(
    token: TokenDefinition & { readonly projectId: string },
    values: readonly ModeValue[],
  ): Promise<void>;
}

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

export type InvalidModes = {
  readonly code: "invalid_modes";
  readonly refusals: readonly ModeRefusal[];
};

export type InvalidReferences = {
  readonly code: "invalid_references";
  readonly refusals: readonly {
    readonly mode?: string;
    readonly field?: string;
    readonly refusal: ReferenceRefusal;
  }[];
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

type Resolution = ReturnType<typeof resolveReference>;

type Resolved = PlacedValue & {
  readonly resolution: Resolution | undefined;
  readonly fields: readonly { readonly field: string; readonly resolution: Resolution }[];
};

const resolved = (
  placed: readonly PlacedValue[],
  {
    $type,
    tokens,
    written,
    pending,
  }: {
    readonly $type: string;
    readonly tokens: readonly ProjectToken[];
    readonly written: readonly WrittenToken[];
    readonly pending: readonly WrittenToken[];
  },
): readonly Resolved[] =>
  placed.map((value) => {
    const name = aliasName(value.value);
    return {
      ...value,
      resolution:
        name === undefined
          ? undefined
          : resolveReference({ name, $type, tokens, written, pending }),
      fields: fieldAliases({ $type, value: value.value }).map((alias) => ({
        field: alias.field,
        resolution: resolveReference({ ...alias, tokens, written, pending }),
      })),
    };
  });

const referenceRefusalsOf = (values: readonly Resolved[]): InvalidReferences["refusals"] =>
  values.flatMap(({ mode, resolution, fields }) =>
    [{ resolution }, ...fields].flatMap((placed) =>
      placed.resolution !== undefined && "refusal" in placed.resolution
        ? [
            {
              ...(mode === undefined ? {} : { mode: mode.name }),
              ...("field" in placed ? { field: placed.field } : {}),
              refusal: placed.resolution.refusal,
            },
          ]
        : [],
    ),
  );

export const modeValueOf = ({ mode, value, resolution, fields }: Resolved): ModeValue => {
  const referencedTokenId =
    resolution !== undefined && "tokenId" in resolution ? resolution.tokenId : null;
  return {
    modeId: mode?.id ?? null,
    value: referencedTokenId === null ? value : null,
    referencedTokenId,
    fieldReferences: fields.flatMap(({ field, resolution: fieldResolution }) =>
      "tokenId" in fieldResolution ? [{ field, referencedTokenId: fieldResolution.tokenId }] : [],
    ),
  };
};

export const checkedValues = (
  token: TokenDefinition,
  {
    projectModes,
    tokens,
    written = [],
    pending = [],
  }: {
    readonly projectModes: readonly ProjectMode[];
    readonly tokens: readonly ProjectToken[];
    readonly written?: readonly WrittenToken[];
    readonly pending?: readonly WrittenToken[];
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
    pending,
  });
  const referenceRefusals = referenceRefusalsOf(values);
  if (referenceRefusals.length > 0) {
    return err({ code: "invalid_references", refusals: referenceRefusals });
  }
  return ok(values);
};

export const addToken =
  ({
    access,
    modes,
    projectTokens,
    unitOfWork,
    newId,
    now,
  }: {
    readonly access: ProjectAccess;
    readonly modes: ModeReader;
    readonly projectTokens: ProjectTokenReader;
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
    return unitOfWork.run(async ({ tokens, history, proposals }) => {
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
    });
  };
