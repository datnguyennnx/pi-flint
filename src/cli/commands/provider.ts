import { parseArgs } from "node:util";
import { Effect } from "effect";
import { allProviders, AuthStore } from "../../providers/index.ts";

function providerIds(): string[] {
  return allProviders().map((plugin) => plugin.provider.id);
}

export function runProvider(argv: readonly string[] = []): Effect.Effect<number> {
  return Effect.gen(function* () {
    const parsed = parseArgs({
      args: [...argv],
      options: { key: { type: "string" } },
      allowPositionals: true,
      strict: false,
    });

    const action = parsed.positionals[0] ?? "list";
    const id = parsed.positionals[1];

    if (action === "list") {
      for (const providerId of providerIds()) process.stdout.write(`${providerId}\n`);
      return 0;
    }

    if (action === "connect") {
      if (!id) {
        process.stderr.write("pi-flint provider connect: missing provider id\n");
        return 1;
      }

      const key = parsed.values.key;
      if (typeof key !== "string" || key.length === 0) {
        process.stdout.write(
          `pi-flint provider connect ${id}: pass --key <key> to persist a credential.\n`,
        );
        return 0;
      }

      const auth = yield* AuthStore;
      const failed = yield* auth.set(id, { type: "api_key", key }).pipe(
        Effect.as(false),
        Effect.catch(() => Effect.succeed(true)),
      );
      if (failed) {
        process.stderr.write(`pi-flint provider connect: failed to save ${id}\n`);
        return 1;
      }

      process.stdout.write(`Saved credentials for ${id}\n`);
      return 0;
    }

    process.stderr.write(`pi-flint provider: unknown action '${action}'\n`);
    return 1;
  }).pipe(Effect.provide(AuthStore.layer()));
}
