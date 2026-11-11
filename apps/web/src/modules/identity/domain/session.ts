export type Session = {
  readonly userId: string;
  readonly email: string;
};

export type Credentials = {
  readonly email: string;
  readonly password: string;
};

export type Registration = Credentials & { readonly name: string };
