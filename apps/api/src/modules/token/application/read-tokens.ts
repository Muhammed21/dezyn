import type { ProjectAccess } from "#modules/space/contracts/membership.ts";
import { err, ok, type Result } from "@repo/result";

import { duplicatesOf } from "../domain/duplicates.ts";
import { type Extensions, isExtensions } from "../domain/extensions.ts";
import type { FigmaState } from "../domain/figma-declaration.ts";
import type { ModeReader } from "./token-values.ts";

export type StoredValue = {
  readonly tokenId: string;
  readonly name: string;
  readonly $type: string;
  readonly $description: string | null;
  readonly $extensions: unknown;
  readonly mode: string | null;
  readonly value: unknown;
  readonly referencedName: string | null;
};

export interface ValidatedTokenReader {
  validatedValuesOf(projectId: string): Promise<readonly StoredValue[]>;
}

export type TokenFigmaState = {
  readonly tokenId: string;
  readonly state: FigmaState;
  readonly figmaVariables?: readonly string[];
  readonly declaredAt: Date;
  readonly author: { readonly kind: "member"; readonly userId: string; readonly name: string };
  readonly clientId: string;
};

export interface FigmaStateReader {
  figmaStatesOf(projectId: string): Promise<readonly TokenFigmaState[]>;
}

export type ReadToken = {
  readonly id: string;
  readonly name: string;
  readonly $type: string;
  readonly $value?: unknown;
  readonly modes?: Readonly<Record<string, unknown>>;
  readonly $description?: string;
  readonly $extensions?: Extensions;
  readonly status: "validated";
  readonly duplicates?: readonly string[];
  readonly figma?: Omit<TokenFigmaState, "tokenId">;
};

export type ProjectTokens = {
  readonly modes: readonly string[];
  readonly tokens: readonly ReadToken[];
};

const renderedValue = ({ value, referencedName }: StoredValue): unknown =>
  referencedName === null ? value : `{${referencedName}}`;

type TokenValues = readonly [StoredValue, ...StoredValue[]];

const figmaOf = (
  tokenId: string,
  figmaStates: readonly TokenFigmaState[],
): Pick<ReadToken, "figma"> => {
  const found = figmaStates.find((figma) => figma.tokenId === tokenId);
  if (found === undefined) {
    return {};
  }
  const { tokenId: _, ...figma } = found;
  return { figma };
};

const tokenOf = (values: TokenValues): ReadToken => {
  const { tokenId, name, $type, $description, $extensions, mode } = values[0];
  return {
    id: tokenId,
    name,
    $type,
    ...(mode === null
      ? { $value: renderedValue(values[0]) }
      : { modes: Object.fromEntries(values.map((value) => [value.mode, renderedValue(value)])) }),
    ...($description === null ? {} : { $description }),
    ...(isExtensions($extensions) ? { $extensions } : {}),
    status: "validated",
  };
};

const byToken = (values: readonly StoredValue[]): readonly TokenValues[] =>
  values.reduce<readonly TokenValues[]>((groups, value) => {
    const last = groups.at(-1);
    return last?.[0].tokenId === value.tokenId
      ? [...groups.slice(0, -1), [...last, value]]
      : [...groups, [value]];
  }, []);

export const readValidatedTokens =
  ({ modes, tokens }: { readonly modes: ModeReader; readonly tokens: ValidatedTokenReader }) =>
  async (projectId: string): Promise<ProjectTokens> => {
    const [projectModes, values] = await Promise.all([
      modes.modesOf(projectId),
      tokens.validatedValuesOf(projectId),
    ]);
    return {
      modes: projectModes.map(({ name }) => name),
      tokens: byToken(values).map(tokenOf),
    };
  };

export const readTokens = ({
  modes,
  tokens,
  figmaStates,
}: {
  readonly modes: ModeReader;
  readonly tokens: ValidatedTokenReader;
  readonly figmaStates: FigmaStateReader;
}) => {
  const readValidated = readValidatedTokens({ modes, tokens });
  return async (projectId: string): Promise<ProjectTokens> => {
    const [validated, figma] = await Promise.all([
      readValidated(projectId),
      figmaStates.figmaStatesOf(projectId),
    ]);
    const read = validated.tokens.map((token) => ({ ...token, ...figmaOf(token.id, figma) }));
    return {
      modes: validated.modes,
      tokens: read.map((token) => {
        const duplicates = duplicatesOf({ token, among: read });
        return duplicates.length === 0 ? token : { ...token, duplicates };
      }),
    };
  };
};

export const readProjectTokens =
  ({
    access,
    readTokens: read,
  }: {
    readonly access: ProjectAccess;
    readonly readTokens: (projectId: string) => Promise<ProjectTokens>;
  }) =>
  async ({
    projectId,
    userId,
  }: {
    readonly projectId: string;
    readonly userId: string;
  }): Promise<Result<ProjectTokens, "not_found">> => {
    const project = await access({ projectId, userId, action: "space.read" });
    if (project === undefined) {
      return err("not_found");
    }
    return ok(await read(projectId));
  };
