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
  $description,
  $extensions,
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
