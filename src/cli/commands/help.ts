import { Effect } from "effect";
import { commandEntries } from "./index.ts";

export function usageText(): string {
  const lines = [
    "pi-flint \u2014 an OpenTUI coding agent",
    "",
    "Usage: pi-flint [command] [options]",
    "",
    "Commands:",
  ];

  for (const [name, command] of commandEntries()) {
    lines.push(`  ${name.padEnd(10)}${command.description}`);
  }

  lines.push(
    "",
    "Options:",
    "  -h, --help     Show this help",
    "  -v, --version  Print version",
    "",
  );

  return lines.join("\n");
}

export function runHelp(_argv: readonly string[] = []): Effect.Effect<number> {
  return Effect.sync(() => {
    process.stdout.write(usageText());
    return 0;
  });
}
