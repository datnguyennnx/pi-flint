import type { Provider } from "@earendil-works/pi-ai";
import { Effect } from "effect";
import type { HostShape, Plugin } from "../core/index.ts";

export interface ProviderPlugin extends Plugin {
  readonly provider: Provider;
}

export function providerPlugin(name: string, provider: Provider): ProviderPlugin {
  return {
    name,
    provider,
    setup(host: HostShape): Effect.Effect<void> {
      return Effect.sync(() => {
        host.registerProvider(name, provider);
      });
    },
  };
}
