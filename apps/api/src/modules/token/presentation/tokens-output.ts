import type { ProjectTokens, ReadToken } from "../application/read-tokens.ts";

const tokenOutputOf = ({ figma, ...token }: ReadToken) =>
  figma === undefined
    ? token
    : { ...token, figma: { ...figma, declaredAt: figma.declaredAt.toISOString() } };

export const tokensOutputOf = <Read extends ProjectTokens>({ tokens, ...read }: Read) => ({
  ...read,
  tokens: tokens.map(tokenOutputOf),
});
