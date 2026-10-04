import { createProvider, envApiKeyAuth, type Model } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import type { ProviderPlugin } from "../registry.ts";
import { providerPlugin } from "../registry.ts";

export const CORALBRICKS_BASE_URL = "https://inference.coralbricks.ai/v1";

const CONTEXT_WINDOW = 1_048_576;
const MAX_TOKENS = 131_072;

const cost = (
  input: number,
  output: number,
): Model<"openai-completions">["cost"] => ({ input, output, cacheRead: 0, cacheWrite: 0 });

const model = (
  id: string,
  name: string,
  rates: Model<"openai-completions">["cost"],
): Model<"openai-completions"> => ({
  id,
  name,
  api: "openai-completions",
  provider: "coralbricks",
  baseUrl: CORALBRICKS_BASE_URL,
  input: ["text"],
  reasoning: true,
  cost: rates,
  contextWindow: CONTEXT_WINDOW,
  maxTokens: MAX_TOKENS,
});

export function coralbricksProvider() {
  return createProvider({
    id: "coralbricks",
    name: "CoralBricks",
    baseUrl: CORALBRICKS_BASE_URL,
    auth: {
      apiKey: envApiKeyAuth("CoralBricks API key", ["CORALBRICKS_API_KEY", "CORAL_API_KEY"]),
    },
    models: [
      model("deepseek-v4.1-flash-fast-fp4", "DeepSeek V4.1 Flash FP4", cost(0.3, 1.2)),
      model("deepseek-v4.1-flash-fast", "DeepSeek V4.1 Flash", cost(0.3, 1.2)),
      model("glm-5.3-fp4", "GLM 5.3", cost(1.12, 4.4)),
      model("glm-5.3-flash-fp4", "GLM 5.3 Flash", cost(0.15, 0.5)),
    ],
    api: openAICompletionsApi(),
  });
}

export function coralbricksPlugin(): ProviderPlugin {
  return providerPlugin("coralbricks", coralbricksProvider());
}
