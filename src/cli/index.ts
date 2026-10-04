#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { Effect, Layer } from "effect";
import { Host } from "../core/index.ts";
import { AuthStore } from "../providers/index.ts";
import { resolveCommand } from "./commands/index.ts";
import type { Command } from "./commands/index.ts";
import { usageText } from "./commands/help.ts";

const AppLayer = Layer.merge(Host.layer, AuthStore.layer());

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const parsed = parseArgs({
    args: [...argv],
    options: {
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
    allowPositionals: true,
    strict: false,
  });

  const runCommand = (command: Command, rest: readonly string[]): Promise<number> =>
    Effect.runPromise(command.run(rest).pipe(Effect.provide(AppLayer)));

  if (parsed.values.help) {
    const help = resolveCommand("help");
    if (help) return runCommand(help, []);
  }

  if (parsed.values.version) {
    const version = resolveCommand("version");
    if (version) return runCommand(version, []);
  }

  const commandIndex = argv.findIndex((arg) => !arg.startsWith("-"));
  const commandName = commandIndex === -1 ? undefined : argv[commandIndex];
  const rest = commandIndex === -1 ? [] : argv.slice(commandIndex + 1);

  const command = resolveCommand(commandName);
  if (!command) {
    process.stderr.write(`pi-flint: unknown command '${commandName}'\n\n`);
    process.stderr.write(usageText());
    return 1;
  }

  return runCommand(command, rest);
}

process.exitCode = await main();
