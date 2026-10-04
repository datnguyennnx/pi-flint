export type { ProviderPlugin } from "./registry.ts";
export { providerPlugin } from "./registry.ts";
export { opencodePlugin, opencodeProvider } from "./opencode/index.ts";
export {
  opencodeGoPlugin,
  opencodeGoProvider,
  opencodeGoModelId,
  OPENCODE_GO_BASE_URL,
  OPENCODE_GO_SESSION_HEADER,
} from "./opencode-go/index.ts";
export type { OpenCodeGoOptions } from "./opencode-go/index.ts";
export { coralbricksPlugin, coralbricksProvider, CORALBRICKS_BASE_URL } from "./coralbricks/index.ts";
export { AuthStore, AuthError, createAuthStore } from "./auth.ts";
export type { AuthStoreShape } from "./auth.ts";

import { opencodePlugin } from "./opencode/index.ts";
import { opencodeGoPlugin } from "./opencode-go/index.ts";
import { coralbricksPlugin } from "./coralbricks/index.ts";
import type { ProviderPlugin } from "./registry.ts";

export function allProviders(): ProviderPlugin[] {
  const session = process.env.OPENCODE_SESSION ?? "pi-flint";
  return [opencodePlugin(), opencodeGoPlugin({ session }), coralbricksPlugin()];
}
