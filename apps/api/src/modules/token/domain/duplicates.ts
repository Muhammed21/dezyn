import { aliasName } from "./reference.ts";
import { sameDefinition } from "./same-definition.ts";

export type ComparedToken = {
  readonly name: string;
  readonly $type: string;
  readonly $value?: unknown;
  readonly modes?: Readonly<Record<string, unknown>>;
};

const sameValue = (left: ComparedToken, right: ComparedToken): boolean =>
  left.$type === right.$type &&
  sameDefinition(
    { $value: left.$value, modes: left.modes },
    { $value: right.$value, modes: right.modes },
  );

const isReference = (value: unknown): boolean =>
  typeof value === "string" && aliasName(value) !== undefined;

const referencesAnother = ({ $value, modes }: ComparedToken): boolean =>
  (modes === undefined ? [$value] : Object.values(modes)).some(isReference);

export const duplicatesOf = ({
  token,
  among,
}: {
  readonly token: ComparedToken;
  readonly among: readonly ComparedToken[];
}): readonly string[] =>
  referencesAnother(token)
    ? []
    : among
        .filter((other) => other.name !== token.name && sameValue(token, other))
        .map(({ name }) => name);
