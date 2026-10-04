import { opencodeProvider } from "@earendil-works/pi-ai/providers/opencode";
import type { ProviderPlugin } from "../registry.ts";
import { providerPlugin } from "../registry.ts";

export { opencodeProvider };

export function opencodePlugin(): ProviderPlugin {
  return providerPlugin("opencode", opencodeProvider());
}
