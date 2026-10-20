import { isReference } from "./reference.ts";
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

const containsReference = (value: unknown): boolean =>
  isReference(value) ||
  (typeof value === "object" && value !== null && Object.values(value).some(containsReference));

const referencesAnother = ({ $value, modes }: ComparedToken): boolean =>
  (modes === undefined ? [$value] : Object.values(modes)).some(containsReference);

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
