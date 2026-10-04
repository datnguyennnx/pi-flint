import { readFileSync } from "node:fs";
import { Effect } from "effect";

function readPackageVersion(): string {
  const candidates = [
    new URL("../../../package.json", import.meta.url),
    new URL("../package.json", import.meta.url),
  ];

  for (const url of candidates) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(url, "utf8"));
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "version" in parsed &&
        typeof (parsed as { version?: unknown }).version === "string"
      ) {
        return (parsed as { version: string }).version;
      }
    } catch {
    }
  }

  throw new Error("pi-flint: unable to read version from package.json");
}

export function runVersion(_argv: readonly string[] = []): Effect.Effect<number> {
  return Effect.sync(() => {
    process.stdout.write(`${readPackageVersion()}\n`);
    return 0;
  });
}
