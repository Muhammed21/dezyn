export type DtcgToken = {
  readonly name: string;
  readonly $type: string;
  readonly $value?: unknown;
  readonly $description?: string;
  readonly $extensions?: unknown;
};

export type DtcgGroup = { readonly [segment: string]: unknown };

const headOf = (name: string) => {
  const dot = name.indexOf(".");
  return dot === -1 ? name : name.slice(0, dot);
};

const entryOf = ({ $type, $value, $description, $extensions }: DtcgToken) => ({
  $type,
  $value,
  ...($description === undefined ? {} : { $description }),
  ...($extensions === undefined ? {} : { $extensions }),
});

export const dtcgDocumentOf = (tokens: readonly DtcgToken[]): DtcgGroup =>
  Object.fromEntries(
    [...new Set(tokens.map(({ name }) => headOf(name)))].map((head) => {
      const members = tokens.filter(({ name }) => headOf(name) === head);
      const token = members.find(({ name }) => name === head);
      return [
        head,
        token === undefined
          ? dtcgDocumentOf(
              members.map((member) => ({ ...member, name: member.name.slice(head.length + 1) })),
            )
          : entryOf(token),
      ];
    }),
  );

export const RESOLVER_VERSION = "2025.10";

export type ModalToken = Omit<DtcgToken, "$value"> & {
  readonly modes?: Readonly<Record<string, unknown>>;
};

const tokensIn = (mode: string, tokens: readonly ModalToken[]): readonly DtcgToken[] =>
  tokens.map(({ modes, ...token }) => ({ ...token, $value: modes?.[mode] }));

export const resolverDocumentOf = ({
  modifier,
  modes,
  tokens,
}: {
  readonly modifier: string;
  readonly modes: readonly string[];
  readonly tokens: readonly ModalToken[];
}) => ({
  version: RESOLVER_VERSION,
  modifiers: {
    [modifier]: {
      contexts: Object.fromEntries(
        modes.map((mode) => [mode, [dtcgDocumentOf(tokensIn(mode, tokens))]]),
      ),
      default: modes[0],
    },
  },
  resolutionOrder: [{ $ref: `#/modifiers/${modifier}` }],
});
