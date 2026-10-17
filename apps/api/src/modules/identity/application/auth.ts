export type Auth = {
  readonly handle: (request: Request) => Promise<Response>;
};
