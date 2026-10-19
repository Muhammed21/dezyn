import type { ModeReader } from "./add-token.ts";

export type StoredValue = {
  readonly tokenId: string;
  readonly name: string;
  readonly $type: string;
  readonly $description: string | null;
  readonly mode: string | null;
  readonly value: unknown;
  readonly referencedName: string | null;
};

export interface ValidatedTokenReader {
  validatedValuesOf(projectId: string): Promise<readonly StoredValue[]>;
}

export type ReadToken = {
  readonly id: string;
  readonly name: string;
  readonly $type: string;
  readonly $value?: unknown;
  readonly modes?: Readonly<Record<string, unknown>>;
  readonly $description?: string;
  readonly status: "validated";
};

export type ProjectTokens = {
  readonly modes: readonly string[];
  readonly tokens: readonly ReadToken[];
};

const renderedValue = ({ value, referencedName }: StoredValue): unknown =>
  referencedName === null ? value : `{${referencedName}}`;

type TokenValues = readonly [StoredValue, ...StoredValue[]];

const tokenOf = (values: TokenValues): ReadToken => {
  const { tokenId, name, $type, $description, mode } = values[0];
  return {
    id: tokenId,
    name,
    $type,
    ...(mode === null
      ? { $value: renderedValue(values[0]) }
      : { modes: Object.fromEntries(values.map((value) => [value.mode, renderedValue(value)])) }),
    ...($description === null ? {} : { $description }),
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

export const readTokens =
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
