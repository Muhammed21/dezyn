export type Auth = {
  readonly handle: (request: Request) => Promise<Response>;
  readonly authorizationServerMetadata: (request: Request) => Promise<Response>;
  readonly protectedResourceMetadata: (request: Request) => Promise<Response>;
};
