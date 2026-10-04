import type { Provider } from "@earendil-works/pi-ai";
import { opencodeGoProvider } from "@earendil-works/pi-ai/providers/opencode-go";
import type { ProviderPlugin } from "../registry.ts";
import { providerPlugin } from "../registry.ts";

export { opencodeGoProvider };

export const OPENCODE_GO_BASE_URL = "https://opencode.ai/zen/go/v1";
export const OPENCODE_GO_SESSION_HEADER = "x-opencode-session";

export function opencodeGoModelId(id: string): string {
  return id.startsWith("opencode-go/") ? id : `opencode-go/${id}`;
}

export interface OpenCodeGoOptions {
  session: string;
}

export function opencodeGoPlugin(options: OpenCodeGoOptions): ProviderPlugin {
  if (options.session.trim() === "") {
    throw new Error("opencode-go requires a stable x-opencode-session value");
  }
  const base = opencodeGoProvider();
  const provider: Provider = {
    ...base,
    baseUrl: OPENCODE_GO_BASE_URL,
    headers: { ...base.headers, [OPENCODE_GO_SESSION_HEADER]: options.session },
  };
  return providerPlugin("opencode-go", provider);
}
