import type { Effect } from "effect";
import { runHelp } from "./help.ts";
import { runProvider } from "./provider.ts";
import { runTui } from "./tui.ts";
import { runVersion } from "./version.ts";

export interface Command {
  readonly description: string;
  run(argv: readonly string[]): Effect.Effect<number>;
}

const registry: Record<string, Command> = {
  tui: { description: "Launch the interactive TUI", run: runTui },
  provider: {
    description: "List providers or connect one (provider [list|connect <id>])",
    run: runProvider,
  },
  help: { description: "Show usage information", run: runHelp },
  version: { description: "Print the pi-flint version", run: runVersion },
};

export const DEFAULT_COMMAND = "tui";

export function resolveCommand(name?: string): Command | undefined {
  if (name === undefined) return registry[DEFAULT_COMMAND];
  return registry[name];
}

export function commandEntries(): readonly (readonly [string, Command])[] {
  return Object.entries(registry);
}

export function commandNames(): readonly string[] {
  return Object.keys(registry);
}
