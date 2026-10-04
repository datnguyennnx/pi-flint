import { parseArgs } from "node:util";
import { Effect } from "effect";
import { layer as GlobalLayer } from "@opencode-ai/core/global";
import type { Args } from "../../tui/context/args.tsx";
import type { TuiPluginHost } from "../../tui/plugin/runtime.tsx";

const PI_FLINT_TUI_URL = "http://opencode.internal";

function createStubPluginHost(): TuiPluginHost {
  let disposeSlots: (() => void) | undefined;
  return {
    async start(input) {
      disposeSlots = input.runtime.setupSlots(input.api).dispose;
    },
    async dispose() {
      disposeSlots?.();
      disposeSlots = undefined;
    },
  };
}

function parseTuiArgs(argv: readonly string[]): Args {
  const parsed = parseArgs({
    args: [...argv],
    options: {
      model: { type: "string", short: "m" },
      agent: { type: "string" },
      prompt: { type: "string" },
      continue: { type: "boolean", short: "c" },
      session: { type: "string", short: "s" },
      fork: { type: "boolean" },
      auto: { type: "boolean" },
    },
    strict: false,
    allowPositionals: true,
  });

  const str = (value: string | boolean | undefined) => (typeof value === "string" ? value : undefined);
  const bool = (value: string | boolean | undefined) => (typeof value === "boolean" ? value : undefined);

  return {
    model: str(parsed.values.model),
    agent: str(parsed.values.agent),
    prompt: str(parsed.values.prompt),
    continue: bool(parsed.values.continue),
    sessionID: str(parsed.values.session),
    fork: bool(parsed.values.fork),
    auto: bool(parsed.values.auto),
  };
}

export function runTui(argv: readonly string[] = []): Effect.Effect<number> {
  return Effect.gen(function* () {
    const [{ run }, { TuiConfig }] = yield* Effect.promise(() =>
      Promise.all([import("../../tui/index.tsx"), import("../../tui/config/index.tsx")]),
    );

    const input = {
      url: PI_FLINT_TUI_URL,
      args: parseTuiArgs(argv),
      config: TuiConfig.resolve({}, { terminalSuspend: false }),
      pluginHost: createStubPluginHost(),
      directory: process.cwd(),
    };

    yield* run(input).pipe(Effect.provide(GlobalLayer)) as Effect.Effect<void>;
    return 0;
  });
}
