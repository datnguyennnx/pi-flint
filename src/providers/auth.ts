import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Credential } from "@earendil-works/pi-ai";
import { Context, Effect, Layer, Schema } from "effect";

export class AuthError extends Schema.TaggedError<AuthError>()("AuthError", {
  cause: Schema.Defect(),
}) {}

const DEFAULT_AUTH_PATH = join(homedir(), ".pi-flint", "auth.json");

const ApiKeyCredentialSchema = Schema.Struct({
  type: Schema.Literal("api_key"),
  key: Schema.optional(Schema.String),
  env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
});

const OAuthCredentialSchema = Schema.Struct({
  type: Schema.Literal("oauth"),
  refresh: Schema.String,
  access: Schema.String,
  expires: Schema.Number,
});

const AuthFileSchema = Schema.Record(
  Schema.String,
  Schema.Union([ApiKeyCredentialSchema, OAuthCredentialSchema]),
);

type AuthFile = Record<string, Credential>;

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

function readAuthFile(path: string): Effect.Effect<AuthFile, AuthError> {
  return Effect.gen(function* () {
    const raw = yield* Effect.tryPromise({
      try: async () => {
        try {
          return await readFile(path, "utf8");
        } catch (error) {
          if (isNotFound(error)) return undefined;
          throw error;
        }
      },
      catch: (cause) => new AuthError({ cause }),
    });
    if (raw === undefined) return {} as AuthFile;

    const parsed = yield* Effect.try({
      try: () => JSON.parse(raw) as unknown,
      catch: (cause) => new AuthError({ cause }),
    });

    yield* Schema.decodeUnknownEffect(AuthFileSchema)(parsed).pipe(
      Effect.mapError((cause) => new AuthError({ cause })),
    );
    return parsed as AuthFile;
  });
}

function writeAuthFile(path: string, data: AuthFile): Effect.Effect<void, AuthError> {
  return Effect.tryPromise({
    try: async () => {
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
      await chmod(path, 0o600);
    },
    catch: (cause) => new AuthError({ cause }),
  });
}

export interface AuthStoreShape {
  get(provider: string): Effect.Effect<Credential | undefined, AuthError>;
  set(provider: string, credential: Credential): Effect.Effect<Credential | undefined, AuthError>;
  list(): Effect.Effect<readonly string[], AuthError>;
  delete(provider: string): Effect.Effect<void, AuthError>;
}

export function createAuthStore(authPath: string = DEFAULT_AUTH_PATH): AuthStoreShape {
  return AuthStore.of({
    get: (provider) =>
      Effect.gen(function* () {
        const data = yield* readAuthFile(authPath);
        return data[provider];
      }),
    set: (provider, credential) =>
      Effect.gen(function* () {
        const data = yield* readAuthFile(authPath);
        const previous = data[provider];
        data[provider] = credential;
        yield* writeAuthFile(authPath, data);
        return previous;
      }),
    list: () =>
      Effect.gen(function* () {
        const data = yield* readAuthFile(authPath);
        return Object.keys(data);
      }),
    delete: (provider) =>
      Effect.gen(function* () {
        const data = yield* readAuthFile(authPath);
        if (!Object.prototype.hasOwnProperty.call(data, provider)) return;
        delete data[provider];
        yield* writeAuthFile(authPath, data);
      }),
  });
}

export class AuthStore extends Context.Service<AuthStore, AuthStoreShape>()("@pi-flint/AuthStore") {
  static layer(authPath: string = DEFAULT_AUTH_PATH): Layer.Layer<AuthStore> {
    return Layer.succeed(AuthStore, createAuthStore(authPath));
  }
}
