import type { Provider } from "@earendil-works/pi-ai";
import { Context, Effect, Layer } from "effect";
import type { Plugin } from "./plugin.ts";
import { Registry } from "./registry.ts";

export interface Command {
  name: string;
  description?: string;
  run(...args: unknown[]): void | Promise<void>;
}

export interface UiSlot {
  name: string;
  render(): unknown;
}

export interface HostShape {
  readonly providers: Registry<Provider>;
  readonly commands: Registry<Command>;
  readonly ui: Registry<UiSlot>;
  readonly plugins: Registry<Plugin>;

  registerProvider(name: string, provider: Provider): void;
  getProvider(name: string): Provider | undefined;
  listProviders(): readonly Provider[];

  registerCommand(command: Command): void;
  getCommand(name: string): Command | undefined;
  listCommands(): readonly Command[];

  registerUi(slot: UiSlot): void;
  getUi(name: string): UiSlot | undefined;
  listUi(): readonly UiSlot[];

  use(plugin: Plugin): Effect.Effect<void>;
}

class HostImpl implements HostShape {
  readonly providers = new Registry<Provider>();
  readonly commands = new Registry<Command>();
  readonly ui = new Registry<UiSlot>();
  readonly plugins = new Registry<Plugin>();

  registerProvider(name: string, provider: Provider): void {
    this.providers.register(name, provider);
  }

  getProvider(name: string): Provider | undefined {
    return this.providers.get(name);
  }

  listProviders(): readonly Provider[] {
    return this.providers.list();
  }

  registerCommand(command: Command): void {
    this.commands.register(command.name, command);
  }

  getCommand(name: string): Command | undefined {
    return this.commands.get(name);
  }

  listCommands(): readonly Command[] {
    return this.commands.list();
  }

  registerUi(slot: UiSlot): void {
    this.ui.register(slot.name, slot);
  }

  getUi(name: string): UiSlot | undefined {
    return this.ui.get(name);
  }

  listUi(): readonly UiSlot[] {
    return this.ui.list();
  }

  use(plugin: Plugin): Effect.Effect<void> {
    const host = this;
    return Effect.gen(function* () {
      yield* plugin.setup(host);
      host.plugins.register(plugin.name, plugin);
    });
  }
}

export class Host extends Context.Service<Host, HostShape>()("@pi-flint/Host") {
  static readonly layer: Layer.Layer<Host> = Layer.succeed(Host, new HostImpl());
}

export interface Host extends HostShape {}

export function createHost(): HostShape {
  return new HostImpl();
}
