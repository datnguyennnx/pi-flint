import type { Api, Model } from "@earendil-works/pi-ai";
import { Effect } from "effect";
import { allProviders } from "../providers/index.ts";
import { AgentError } from "./service.ts";

const MODEL_ENV = "PI_FLINT_MODEL";

let selectedSpec: string | undefined;

export function setModelSelection(
  selection: { providerID: string; modelID: string } | string | undefined,
): void {
  if (selection === undefined) {
    selectedSpec = undefined;
    return;
  }
  selectedSpec =
    typeof selection === "string" ? selection : `${selection.providerID}/${selection.modelID}`;
}

function resolveFromSpec(spec: string): Model<Api> {
  const separator = spec.indexOf("/");
  if (separator <= 0 || separator === spec.length - 1) {
    throw new Error(`invalid '${spec}': expected provider/model`);
  }
  const providerId = spec.slice(0, separator);
  const modelId = spec.slice(separator + 1);
  const provider = allProviders().find((plugin) => plugin.provider.id === providerId)?.provider;
  if (provider === undefined) throw new Error(`unknown provider '${providerId}'`);
  const model = provider.getModels().find((candidate) => candidate.id === modelId);
  if (model === undefined) throw new Error(`unknown model '${modelId}' for provider '${providerId}'`);
  return model;
}

function firstConfiguredModel(): Model<Api> {
  for (const plugin of allProviders()) {
    const model = plugin.provider.getModels()[0];
    if (model !== undefined) return model;
  }
  throw new Error("no configured provider exposes a chat model");
}

export function resolveModel(): Effect.Effect<Model<Api>, AgentError> {
  return Effect.try({
    try: () => {
      const spec = process.env[MODEL_ENV]?.trim();
      if (spec !== undefined && spec.length > 0) return resolveFromSpec(spec);
      const selected = selectedSpec?.trim();
      if (selected !== undefined && selected.length > 0) return resolveFromSpec(selected);
      return firstConfiguredModel();
    },
    catch: (cause) =>
      new AgentError({
        message: `set ${MODEL_ENV}=provider/model: ${cause instanceof Error ? cause.message : String(cause)}`,
        cause,
      }),
  });
}
