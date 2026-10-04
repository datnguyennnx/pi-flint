import { Agent, type AgentEvent, type AgentMessage, type ThinkingLevel } from "@earendil-works/pi-agent-core";
import { contentText, type Api, type Model, type Usage } from "@earendil-works/pi-ai";
import { completeSimple, streamSimple } from "@earendil-works/pi-ai/compat";
import { Context, Effect, Layer, Schema } from "effect";
import { createAuthStore } from "../providers/index.ts";
import { resolveModel } from "./model.ts";

const TITLE_SYSTEM_PROMPT = "You are a title generator. You output ONLY a thread title. Nothing else.";
const TITLE_USER_PREFIX = "Generate a title for this conversation:\n";

// Default reasoning depth for models that support it. An explicit user variant
// still overrides this via AgentService.setThinkingLevel before run().
const DEFAULT_REASONING_LEVEL: ThinkingLevel = "medium";

function defaultThinkingLevel(model: Model<Api>): ThinkingLevel {
  if (model.reasoning !== true) return "off";
  const map = model.thinkingLevelMap as Record<string, string | null> | undefined;
  if (map === undefined || map[DEFAULT_REASONING_LEVEL] !== null) return DEFAULT_REASONING_LEVEL;
  const supported = Object.keys(map).find((level) => level !== "off" && map[level] !== null);
  return (supported as ThinkingLevel | undefined) ?? DEFAULT_REASONING_LEVEL;
}

export interface AgentUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  costTotal: number;
}

export interface AgentStatus {
  modelId: string;
  provider: string;
  thinkingLevel: string;
  contextWindow: number;
}

export interface AgentUiEvent {
  type:
    | "text_delta"
    | "thinking_delta"
    | "tool_start"
    | "tool_end"
    | "done"
    | "error"
    | "usage";
  text?: string;
  toolName?: string;
  message?: string;
  usage?: AgentUsage;
}

export interface HistoryMessage {
  role: "user" | "assistant";
  text: string;
  timestamp?: number;
  provider?: string;
  model?: string;
  usage?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    totalTokens: number;
    costTotal: number;
  };
}

export interface AgentServiceShape {
  run(prompt: string, onEvent: (event: AgentUiEvent) => void): Effect.Effect<void, AgentError>;
  status(): Effect.Effect<AgentStatus, AgentError>;
  setThinkingLevel(level: ThinkingLevel): Effect.Effect<void, AgentError>;
  reset(): Effect.Effect<void>;
  loadHistory(messages: HistoryMessage[]): Effect.Effect<void>;
  summarizeTitle(text: string): Effect.Effect<string, AgentError>;
}

export class AgentError extends Schema.TaggedError<AgentError>()("AgentError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}

export class AgentService extends Context.Service<AgentService, AgentServiceShape>()("@pi-flint/Agent") {}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function mapUsage(usage: Usage | undefined): AgentUsage | undefined {
  if (usage === undefined) return undefined;
  return {
    input: usage.input,
    output: usage.output,
    cacheRead: usage.cacheRead,
    cacheWrite: usage.cacheWrite,
    totalTokens: usage.totalTokens,
    costTotal: usage.cost.total,
  };
}

function toAgentMessages(history: HistoryMessage[]): AgentMessage[] {
  const messages: AgentMessage[] = [];
  for (const turn of history) {
    const timestamp = turn.timestamp ?? Date.now();
    if (turn.role === "user") {
      messages.push({ role: "user", content: turn.text, timestamp });
      continue;
    }
    const usage = turn.usage;
    messages.push({
      role: "assistant",
      content: [{ type: "text", text: turn.text }],
      api: "pi-flint",
      provider: turn.provider ?? "unknown",
      model: turn.model ?? "unknown",
      usage: {
        input: usage?.input ?? 0,
        output: usage?.output ?? 0,
        cacheRead: usage?.cacheRead ?? 0,
        cacheWrite: usage?.cacheWrite ?? 0,
        totalTokens: usage?.totalTokens ?? 0,
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          total: usage?.costTotal ?? 0,
        },
      },
      stopReason: "stop",
      timestamp,
    } as unknown as AgentMessage);
  }
  return messages;
}

export function createAgentService(): AgentServiceShape {
  let agent: Agent | undefined;
  let pendingHistory: AgentMessage[] | undefined;

  const applyPendingHistory = (active: Agent): void => {
    if (pendingHistory === undefined) return;
    const history = pendingHistory;
    pendingHistory = undefined;
    if (history.length > 0 && active.state.messages.length === 0) {
      active.state.messages = history;
    }
  };

  const authStore = createAuthStore();

  const apiKeys = new Map<string, string | undefined>();

  const resolveApiKey = (provider: string): Effect.Effect<string | undefined> =>
    authStore.get(provider).pipe(
      Effect.map((credential) =>
        credential !== undefined && credential.type === "api_key"
          ? credential.key
          : undefined,
      ),
      Effect.catch(() => Effect.succeed(undefined)),
    );

  const getApiKey = (provider: string): string | undefined => apiKeys.get(provider);

  const ensureAgent = (): Effect.Effect<Agent, AgentError> => {
    if (agent !== undefined) return Effect.succeed(agent);
    return resolveModel().pipe(
      Effect.map((model) => {
        const created = new Agent({
          streamFn: streamSimple,
          initialState: { model, thinkingLevel: defaultThinkingLevel(model) },
          getApiKey,
        });
        agent = created;
        applyPendingHistory(created);
        return created;
      }),
    );
  };

  const run = (
    prompt: string,
    onEvent: (event: AgentUiEvent) => void,
  ): Effect.Effect<void, AgentError> =>
    Effect.gen(function* () {
      const active = yield* ensureAgent();
      const provider = active.state.model.provider;
      apiKeys.set(provider, yield* resolveApiKey(provider));
      return yield* Effect.callback<void, AgentError>((resume) => {
        let settled = false;

        const finish = (effect: Effect.Effect<void, AgentError>): void => {
          if (settled) return;
          settled = true;
          unsubscribe();
          resume(effect);
        };

        const unsubscribe = active.subscribe((event: AgentEvent) => {
          switch (event.type) {
            case "message_update": {
              const update = event.assistantMessageEvent;
              if (update.type === "text_delta") {
                onEvent({ type: "text_delta", text: update.delta });
              } else if (update.type === "thinking_delta") {
                onEvent({ type: "thinking_delta", text: update.delta });
              }
              break;
            }
            case "message_end": {
              if (event.message.role === "assistant") {
                const usage = mapUsage(event.message.usage);
                if (usage !== undefined) onEvent({ type: "usage", usage });
              }
              break;
            }
            case "tool_execution_start":
              onEvent({ type: "tool_start", toolName: event.toolName });
              break;
            case "tool_execution_end":
              onEvent({
                type: "tool_end",
                toolName: event.toolName,
                message: event.isError ? "tool failed" : undefined,
              });
              break;
            case "agent_end":
              onEvent({ type: "done" });
              finish(Effect.void);
              break;
            default:
              break;
          }
        });

        void active
          .prompt(prompt)
          .then(() => {
            if (settled) return;
            onEvent({ type: "done" });
            finish(Effect.void);
          })
          .catch((cause: unknown) => {
            const message = errorMessage(cause);
            onEvent({ type: "error", message });
            finish(Effect.fail(new AgentError({ message, cause })));
          });

        return Effect.sync(() => {
          if (settled) return;
          settled = true;
          unsubscribe();
          active.abort();
        });
      });
    });

  const status = (): Effect.Effect<AgentStatus, AgentError> =>
    Effect.gen(function* () {
      const active = yield* ensureAgent();
      const model: Model<Api> | undefined = active.state.model;
      if (model === undefined) {
        return yield* Effect.fail(
          new AgentError({
            message: "agent state has no model; set PI_FLINT_MODEL=provider/model",
          }),
        );
      }
      return {
        modelId: model.id,
        provider: model.provider,
        thinkingLevel: active.state.thinkingLevel,
        contextWindow: model.contextWindow,
      };
    });

  const reset = (): Effect.Effect<void> =>
    Effect.sync(() => {
      agent?.reset();
    });

  const setThinkingLevel = (level: ThinkingLevel): Effect.Effect<void, AgentError> =>
    Effect.gen(function* () {
      const active = yield* ensureAgent();
      active.state.thinkingLevel = level;
    });

  const loadHistory = (history: HistoryMessage[]): Effect.Effect<void> =>
    Effect.sync(() => {
      pendingHistory = toAgentMessages(history);
      if (agent !== undefined) applyPendingHistory(agent);
    });

  const summarizeTitle = (text: string): Effect.Effect<string, AgentError> =>
    Effect.gen(function* () {
      const trimmed = text.trim();
      if (trimmed.length === 0) return "";
      const model = yield* resolveModel();
      const apiKey = yield* resolveApiKey(model.provider);
      return yield* Effect.tryPromise({
        try: async (): Promise<string> => {
          const result = await completeSimple(
            model,
            {
              systemPrompt: TITLE_SYSTEM_PROMPT,
              messages: [
                {
                  role: "user",
                  content: `${TITLE_USER_PREFIX}${trimmed}`,
                  timestamp: Date.now(),
                },
              ],
            },
            apiKey !== undefined ? { apiKey } : undefined,
          );
          return contentText(result.content);
        },
        catch: () => "",
      });
    }).pipe(Effect.catch(() => Effect.succeed("")));

  return AgentService.of({ run, status, setThinkingLevel, reset, loadHistory, summarizeTitle });
}

export const AgentLayer: Layer.Layer<AgentService> = Layer.succeed(AgentService, createAgentService());
