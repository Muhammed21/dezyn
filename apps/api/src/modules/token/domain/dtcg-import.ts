import { RESOLVER_VERSION } from "./dtcg-document.ts";

export type ImportIssue = { readonly path: string; readonly message: string };

export type ImportedCandidate = {
  readonly name: string;
  readonly candidate: Readonly<Record<string, unknown>>;
  readonly typeFrom: string | undefined;
};

type InheritedType = { readonly type: unknown; readonly from: string } | undefined;

export type FlatDocument = {
  readonly candidates: readonly ImportedCandidate[];
  readonly issues: readonly ImportIssue[];
};

export type ImportedResolver = {
  readonly modifier: string | undefined;
  readonly modes: readonly string[];
};

export type ReadDocument = FlatDocument & { readonly resolver?: ImportedResolver };

const RESOLVER_FIELDS = ["version", "resolutionOrder"];

const isObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const merged = (first: FlatDocument, second: FlatDocument): FlatDocument => ({
  candidates: [...first.candidates, ...second.candidates],
  issues: [...first.issues, ...second.issues],
});

export const tokenIssuePath = (name: string, path: string) =>
  path === "name" ? `tokens.${name}` : `tokens.${name}.${path}`;

const pathOf = (name: string, key: string) => (name === "" ? key : `${name}.${key}`);

export const distinct = (issues: readonly ImportIssue[]) =>
  issues.filter(
    (candidate, index) =>
      issues.findIndex(
        ({ path, message }) => path === candidate.path && message === candidate.message,
      ) === index,
  );

export const candidateIssuePath = ({ name, typeFrom }: ImportedCandidate, path: string) =>
  path === "$type" && typeFrom !== undefined
    ? `tokens.${pathOf(typeFrom, "$type")}`
    : tokenIssuePath(name, path);

const UNSUPPORTED = ["$deprecated", "$root"];

type Own = readonly (readonly [string, unknown])[];

const unsupportedOf = (name: string, own: Own): readonly ImportIssue[] =>
  own
    .filter(([key]) => UNSUPPORTED.includes(key))
    .map(([key]) => ({
      path: `tokens.${pathOf(name, key)}`,
      message: "Propriété non prise en charge",
    }));

const tokenOf = (name: string, own: Own, inherited: InheritedType): FlatDocument => {
  const candidate = {
    ...(inherited === undefined ? {} : { $type: inherited.type }),
    ...Object.fromEntries(own.filter(([key]) => !UNSUPPORTED.includes(key))),
  };
  const typeFrom = own.some(([key]) => key === "$type") ? undefined : inherited?.from;
  const unsupported = unsupportedOf(name, own);
  return "$type" in candidate
    ? { candidates: [{ name, candidate, typeFrom }], issues: unsupported }
    : {
        candidates: [],
        issues: [...unsupported, { path: `tokens.${name}.$type`, message: "Type manquant" }],
      };
};

const groupOf = (name: string, own: Own): FlatDocument => ({
  candidates: [],
  issues: own
    .filter(([key]) => key !== "$type")
    .map(([key]) => ({
      path: `tokens.${pathOf(name, key)}`,
      message: UNSUPPORTED.includes(key)
        ? "Propriété non prise en charge"
        : "Propriété de groupe non prise en charge",
    })),
});

const nodeOf = (
  name: string,
  node: Readonly<Record<string, unknown>>,
  inherited: InheritedType,
): FlatDocument => {
  const entries = Object.entries(node);
  const own = entries.filter(([key]) => key.startsWith("$"));
  const children = entries.filter(([key]) => !key.startsWith("$"));
  const isToken = "$value" in node;
  const self = isToken ? tokenOf(name, own, inherited) : groupOf(name, own);
  const childType = isToken || !("$type" in node) ? inherited : { type: node.$type, from: name };
  return children.reduce<FlatDocument>((flat, [key, child]) => {
    const childName = pathOf(name, key);
    return merged(
      flat,
      key.includes(".")
        ? {
            candidates: [],
            issues: [{ path: `tokens.${childName}`, message: "Point interdit dans un nom" }],
          }
        : isObject(child)
          ? nodeOf(childName, child, childType)
          : {
              candidates: [],
              issues: [{ path: `tokens.${childName}`, message: "Ni un token ni un groupe" }],
            },
    );
  }, self);
};

const issue = (path: string, message: string): readonly ImportIssue[] => [{ path, message }];

const assembled = (
  contexts: readonly { readonly mode: string; readonly flat: FlatDocument }[],
): FlatDocument => {
  const names = [
    ...new Set(contexts.flatMap(({ flat }) => flat.candidates.map(({ name }) => name))),
  ];
  const tokens = names.map((name) => {
    const present = contexts.flatMap(({ mode, flat }) =>
      flat.candidates
        .filter((candidate) => candidate.name === name)
        .map(({ candidate, typeFrom }) => ({ mode, candidate, typeFrom })),
    );
    const shared = Object.fromEntries(
      present
        .flatMap(({ candidate }) => Object.entries(candidate))
        .filter(([key]) => key !== "$value"),
    );
    const differing = Object.keys(shared).filter(
      (key) => new Set(present.map(({ candidate }) => JSON.stringify(candidate[key]))).size > 1,
    );
    return {
      candidate: {
        name,
        candidate: {
          ...shared,
          modes: Object.fromEntries(present.map(({ mode, candidate }) => [mode, candidate.$value])),
        },
        typeFrom: present.at(0)?.typeFrom,
      },
      issues: differing.map((key) => ({
        path: `tokens.${name}.${key}`,
        message: "Propriété différente selon le mode",
      })),
    };
  });
  return {
    candidates: tokens.map(({ candidate }) => candidate),
    issues: [
      ...contexts.flatMap(({ flat }) => flat.issues),
      ...tokens.flatMap(({ issues }) => issues),
    ],
  };
};

const inlineSource = (value: unknown) => {
  const sources: readonly unknown[] = Array.isArray(value) ? value : [];
  const [source] = sources;
  return sources.length === 1 && isObject(source) && !("$ref" in source) ? source : undefined;
};

const resolverDocument = (document: Readonly<Record<string, unknown>>): ReadDocument => {
  const structure = [
    ...(document.version === RESOLVER_VERSION ? [] : issue("version", "Version 2025.10 attendue")),
    ...("sets" in document ? issue("sets", "Ensembles non pris en charge") : []),
  ];
  const modifiers = isObject(document.modifiers) ? Object.entries(document.modifiers) : [];
  const [first] = modifiers;
  if (first === undefined || modifiers.length > 1) {
    return {
      resolver: { modifier: undefined, modes: [] },
      candidates: [],
      issues: [...structure, ...issue("modifiers", "Un seul modificateur attendu")],
    };
  }
  const [modifier, definition] = first;
  const own = isObject(definition) ? definition : {};
  const contexts = isObject(own.contexts) ? Object.entries(own.contexts) : [];
  const sources = contexts.map(([mode, value]) => ({ mode, source: inlineSource(value) }));
  const order: readonly unknown[] = Array.isArray(document.resolutionOrder)
    ? document.resolutionOrder
    : [];
  const [step] = order;
  const flat = assembled(
    sources.flatMap(({ mode, source }) =>
      source === undefined ? [] : [{ mode, flat: nodeOf("", source, undefined) }],
    ),
  );
  return {
    resolver: { modifier, modes: contexts.map(([mode]) => mode) },
    candidates: flat.candidates,
    issues: distinct([
      ...structure,
      ...sources
        .filter(({ source }) => source === undefined)
        .map(({ mode }) => ({
          path: `modifiers.${modifier}.contexts.${mode}`,
          message: "Une seule source en ligne attendue",
        })),
      ...("default" in own && !contexts.some(([mode]) => mode === own.default)
        ? issue(`modifiers.${modifier}.default`, "Contexte inconnu")
        : []),
      ...(order.length === 1 && isObject(step) && step.$ref === `#/modifiers/${modifier}`
        ? []
        : issue("resolutionOrder", "Le seul modificateur du document attendu")),
      ...flat.issues,
    ]),
  };
};

export const readDocument = (document: Readonly<Record<string, unknown>>): ReadDocument =>
  RESOLVER_FIELDS.some((field) => field in document)
    ? resolverDocument(document)
    : nodeOf("", document, undefined);
