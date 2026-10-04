import { Effect, ManagedRuntime } from "effect"
import type { createOpencodeClient } from "@opencode-ai/sdk/v2"
import type { Credential } from "@earendil-works/pi-ai"
import { AgentLayer, AgentService, type AgentUiEvent, type HistoryMessage } from "../../agent/index.ts"
import { setModelSelection } from "../../agent/model.ts"
import { allProviders } from "../../providers/index.ts"
import { createAuthStore, type AuthStoreShape } from "../../providers/auth.ts"
import { appendEvent, listSessionIds, readSession } from "./persistence.ts"
import { isDefaultTitle } from "../util/session.ts"

type PiFlintSdkClient = ReturnType<typeof createOpencodeClient>

type GlobalEvent = { payload: any; directory: string; workspace: string | undefined }

class EventBus {
  private sinks = new Set<(event: GlobalEvent) => void>()
  add(sink: (event: GlobalEvent) => void): () => void {
    this.sinks.add(sink)
    return () => this.sinks.delete(sink)
  }
  emit(event: GlobalEvent): void {
    for (const sink of this.sinks) {
      try {
        sink(event)
      } catch {
      }
    }
  }
}

class QueueStream<T> {
  private buffer: T[] = []
  private waiters: Array<(value: IteratorResult<T>) => void> = []
  private closed = false

  push(value: T): void {
    const waiter = this.waiters.shift()
    if (waiter) waiter({ value, done: false })
    else this.buffer.push(value)
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    for (const waiter of this.waiters.splice(0)) waiter({ value: undefined as T, done: true })
  }

  private next(): Promise<IteratorResult<T>> {
    if (this.buffer.length > 0) return Promise.resolve({ value: this.buffer.shift()!, done: false })
    if (this.closed) return Promise.resolve({ value: undefined as T, done: true })
    return new Promise((resolve) => this.waiters.push(resolve))
  }

  stream(): AsyncIterable<T> {
    const self = this
    return {
      [Symbol.asyncIterator]() {
        return {
          next: () => self.next(),
          return: async () => {
            self.close()
            return { value: undefined as T, done: true }
          },
        }
      },
    }
  }
}

const ok = (data: any) => Promise.resolve({ data, error: undefined as any })

const FALLBACK_PREFIX = "__pi_flint_stub__"

function fallbackProxy(path: string[]): any {
  const target = function () {} as any
  return new Proxy(target, {
    get(_target, prop) {
      if (prop === "then" || prop === "toJSON" || typeof prop === "symbol") return undefined
      return fallbackProxy([...path, String(prop)])
    },
    apply() {
      return ok(undefined)
    },
  })
}
const fallback = fallbackProxy([FALLBACK_PREFIX])

let counter = 0
const nextID = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}`
const now = () => Date.now()

const DEFAULT_SESSION_TITLE = "pi-flint"

function isPlaceholderTitle(title: unknown): boolean {
  return title === DEFAULT_SESSION_TITLE || (typeof title === "string" && isDefaultTitle(title))
}

function cleanTitle(raw: string): string {
  const withoutThinking = raw.replace(/<think[\s\S]*?<\/think>/gi, "")
  const line = withoutThinking
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 0)
  if (line === undefined) return ""
  return line.length > 100 ? `${line.slice(0, 97)}...` : line
}

function thinkingVariants(model: any): Record<string, Record<string, unknown>> | undefined {
  if (model?.reasoning !== true) return undefined
  const map = model.thinkingLevelMap as Record<string, string | null> | undefined
  const levels =
    map && Object.keys(map).length > 0
      ? Object.keys(map).filter((level) => map[level] !== null)
      : ["off", "low", "medium", "high"]
  const variants: Record<string, Record<string, unknown>> = {}
  for (const level of levels) variants[level] = {}
  return variants
}

export type PiFlintClientOptions = { directory?: string }

export function createPiFlintClient(options: PiFlintClientOptions = {}): PiFlintSdkClient {
  const directory = options.directory ?? process.cwd()
  const bus = new EventBus()
  const emit = (payload: any, workspace?: string) => bus.emit({ payload, directory, workspace })

  const AUTH_ENV_BY_PROVIDER: Record<string, string> = {
    opencode: "OPENCODE_API_KEY",
    "opencode-go": "OPENCODE_API_KEY",
    coralbricks: "CORALBRICKS_API_KEY",
  }

  const envConnected = (): Set<string> => {
    const connected = new Set<string>()
    for (const [provider, envVar] of Object.entries(AUTH_ENV_BY_PROVIDER)) {
      if (process.env[envVar]) connected.add(provider)
    }
    return connected
  }

  const mapModel = (model: any, providerID: string): any => ({
    id: model.id,
    name: model.name ?? model.id,
    providerID,
    api: model.api,
    family: model.family,
    capabilities: {
      temperature: false,
      reasoning: model.reasoning ?? false,
      attachment: Array.isArray(model.input) ? model.input.includes("image") : false,
      toolcall: true,
      input: {
        text: true,
        audio: false,
        image: Array.isArray(model.input) ? model.input.includes("image") : false,
        video: false,
        pdf: false,
      },
      output: { text: true, audio: false, image: false, video: false, pdf: false },
      interleaved: false,
    },
    cost: {
      input: model.cost?.input ?? 0,
      output: model.cost?.output ?? 0,
      cache: { read: model.cost?.cacheRead ?? 0, write: model.cost?.cacheWrite ?? 0 },
    },
    limit: { context: model.contextWindow ?? 0, output: model.maxTokens ?? 0 },
    status: "active",
    options: {},
    headers: {},
    release_date: model.release_date ?? "",
    variants: thinkingVariants(model),
  })

  const providerList = (connected: Set<string>) =>
    allProviders()
      .filter((plugin: any) => connected.has(plugin.provider.id))
      .map((plugin: any) => {
        const models: Record<string, any> = {}
        try {
          for (const model of plugin.provider.getModels?.() ?? []) {
            models[model.id] = mapModel(model, plugin.provider.id)
          }
        } catch {
        }
        return { id: plugin.provider.id, name: plugin.provider.name ?? plugin.provider.id, models }
      })

  const defaultModels = (connected: Set<string>): Record<string, string> => {
    const defaults: Record<string, string> = {}
    for (const plugin of allProviders()) {
      if (!connected.has(plugin.provider.id)) continue
      const first = plugin.provider.getModels?.()[0]
      if (first) defaults[plugin.provider.id] = first.id
    }
    return defaults
  }

  const defaultModel = (connected: Set<string>): string | undefined => {
    for (const plugin of allProviders()) {
      if (!connected.has(plugin.provider.id)) continue
      const first = plugin.provider.getModels?.()[0]
      if (first) return `${plugin.provider.id}/${first.id}`
    }
    return undefined
  }

  const authStore: AuthStoreShape = createAuthStore()

  const connectedProviders = async (): Promise<Set<string>> => {
    const connected = envConnected()
    try {
      for (const id of await Effect.runPromise(authStore.list())) connected.add(id)
    } catch {
    }
    return connected
  }

  const toCredential = (auth: any): Credential | undefined => {
    if (auth === undefined || auth === null || typeof auth !== "object") return undefined
    if (auth.type === "api" || auth.type === "api_key") {
      const key = typeof auth.key === "string" ? auth.key : undefined
      return { type: "api_key", ...(key !== undefined ? { key } : {}) }
    }
    if (auth.type === "oauth") {
      return { type: "oauth", refresh: auth.refresh, access: auth.access, expires: auth.expires }
    }
    return undefined
  }

  const defaultAgentModel = (): { providerID: string; modelID: string } | undefined => {
    const connected = envConnected()
    for (const plugin of allProviders()) {
      if (!connected.has(plugin.provider.id)) continue
      const first = plugin.provider.getModels?.()[0]
      if (first) return { providerID: plugin.provider.id, modelID: first.id }
    }
    return undefined
  }

  const AGENTS = [
    {
      name: "pi-flint",
      description: "pi-flint coding agent",
      mode: "primary",
      hidden: false,
      color: "accent",
      model: defaultAgentModel(),
    },
  ]

  const sessions = new Map<string, any>()
  const messagesBySession = new Map<string, any[]>()
  const partsByMessage = new Map<string, any[]>()
  const titledSessions = new Set<string>()

  const upsertById = (list: any[], value: any): void => {
    const index = list.findIndex((item) => item?.id === value?.id)
    if (index >= 0) list[index] = value
    else list.push(value)
  }

  try {
    for (const sessionID of listSessionIds()) {
      for (const event of readSession(sessionID)) {
        if (event.type === "session") {
          if (event.payload?.id) sessions.set(event.payload.id, event.payload)
        } else if (event.type === "message") {
          const info = event.payload
          if (info?.sessionID && info?.id) {
            const list = messagesBySession.get(info.sessionID) ?? []
            upsertById(list, info)
            messagesBySession.set(info.sessionID, list)
          }
        } else if (event.type === "part") {
          const part = event.payload
          if (part?.messageID && part?.id) {
            const list = partsByMessage.get(part.messageID) ?? []
            upsertById(list, part)
            partsByMessage.set(part.messageID, list)
          }
        }
      }
    }
  } catch {
  }

  function buildHistory(sessionID: string): HistoryMessage[] {
    const history: HistoryMessage[] = []
    for (const info of messagesBySession.get(sessionID) ?? []) {
      const text = (partsByMessage.get(info.id) ?? [])
        .filter((part) => part?.type === "text")
        .map((part) => part.text ?? "")
        .join("")
      if (info?.role !== "user" && info?.role !== "assistant") continue
      if (text.trim() === "") continue
      if (info.role === "user") {
        history.push({ role: "user", text, timestamp: info.time?.created })
      } else {
        history.push({
          role: "assistant",
          text,
          timestamp: info.time?.created,
          provider: info.providerID,
          model: info.modelID,
          usage: info.tokens
            ? {
                input: info.tokens.input ?? 0,
                output: info.tokens.output ?? 0,
                cacheRead: info.tokens.cache?.read ?? 0,
                cacheWrite: info.tokens.cache?.write ?? 0,
                totalTokens: info.tokens.total ?? 0,
                costTotal: info.cost ?? 0,
              }
            : undefined,
        })
      }
    }
    return history
  }

  const location = () => ({ directory, workspaceID: undefined as string | undefined })
  const listResponse = (data: any[]) => ok({ location: location(), data })

  function storeSession(session: any): any {
    sessions.set(session.id, session)
    appendEvent(session.id, { type: "session", payload: session })
    emit({ type: "session.updated", properties: { info: session } })
    return session
  }

  function ensureSession(sessionID: string): any {
    const existing = sessions.get(sessionID)
    if (existing) return existing
    return storeSession({
      id: sessionID,
      title: DEFAULT_SESSION_TITLE,
      directory,
      time: { created: now(), updated: now() },
    })
  }

  function pushMessage(sessionID: string, info: any): void {
    const list = messagesBySession.get(sessionID) ?? []
    upsertById(list, info)
    messagesBySession.set(sessionID, list)
    appendEvent(sessionID, { type: "message", payload: info })
  }

  function pushPart(messageID: string, part: any): void {
    const list = partsByMessage.get(messageID) ?? []
    upsertById(list, part)
    partsByMessage.set(messageID, list)
    if (part?.sessionID) appendEvent(part.sessionID, { type: "part", payload: part })
  }

  function nonSyntheticUserMessages(sessionID: string): any[] {
    return (messagesBySession.get(sessionID) ?? []).filter((info) => {
      if (info?.role !== "user") return false
      return (partsByMessage.get(info.id) ?? []).some(
        (part) => part?.type === "text" && !part.synthetic,
      )
    })
  }

  const runtime = ManagedRuntime.make(AgentLayer)

  const mostRecentSession = [...sessions.values()].sort(
    (a, b) => (b?.time?.updated ?? 0) - (a?.time?.updated ?? 0),
  )[0]
  if (mostRecentSession) {
    const history = buildHistory(mostRecentSession.id)
    if (history.length > 0) {
      void runtime
        .runPromise(
          Effect.gen(function* () {
            const agent = yield* AgentService
            yield* agent.loadHistory(history)
          }),
        )
        .catch(() => undefined)
    }
  }

  function submitPrompt(input: any): Promise<any> {
    const sessionID = input.sessionID
    const session = ensureSession(sessionID)
    if (input.model?.providerID && input.model?.modelID) {
      setModelSelection({ providerID: input.model.providerID, modelID: input.model.modelID })
    }
    const text = (input.parts ?? [])
      .filter((part: any) => part.type === "text")
      .map((part: any) => part.text)
      .join("\n")

    const userID = nextID("msg")
    const user = { id: userID, sessionID, role: "user", time: { created: now() } }
    pushMessage(sessionID, user)
    emit({ type: "message.updated", properties: { info: user } })
    const userPart = { id: nextID("prt"), sessionID, messageID: userID, type: "text", text }
    pushPart(userID, userPart)
    emit({ type: "message.part.updated", properties: { part: userPart } })

    if (
      !titledSessions.has(sessionID) &&
      isPlaceholderTitle(session.title) &&
      nonSyntheticUserMessages(sessionID).length === 1
    ) {
      titledSessions.add(sessionID)
      void runtime
        .runPromise(
          Effect.gen(function* () {
            const agent = yield* AgentService
            return yield* agent.summarizeTitle(text)
          }),
        )
        .then((raw) => {
          const title = cleanTitle(raw)
          if (title.length === 0) return
          const current = sessions.get(sessionID) ?? session
          if (!isPlaceholderTitle(current.title)) return
          current.title = title
          current.time = { ...(current.time ?? {}), updated: now() }
          storeSession(current)
        })
        .catch(() => undefined)
    }

    const assistantID = nextID("msg")
    const assistant: any = {
      id: assistantID,
      sessionID,
      role: "assistant",
      parentID: userID,
      providerID: input.model?.providerID,
      modelID: input.model?.modelID,
      mode: "pi-flint",
      agent: "pi-flint",
      path: { cwd: directory, root: directory },
      cost: 0,
      tokens: { total: 0, input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      time: { created: now() },
    }
    pushMessage(sessionID, assistant)
    emit({ type: "message.updated", properties: { info: assistant } })
    emit({ type: "session.status", properties: { sessionID, status: { type: "busy" } } })

    const textPart: any = {
      id: nextID("prt"),
      sessionID,
      messageID: assistantID,
      type: "text",
      text: "",
      time: { start: now() },
    }
    pushPart(assistantID, textPart)
    emit({
      type: "message.part.updated",
      properties: { part: { ...textPart, time: { ...textPart.time } } },
    })

    // Reasoning is created lazily, the first time the agent streams a
    // thinking_delta. It shares the assistant message the text streams into.
    let reasoningPart: any | undefined
    const ensureReasoningPart = (): any => {
      if (reasoningPart !== undefined) return reasoningPart
      reasoningPart = {
        id: nextID("prt"),
        sessionID,
        messageID: assistantID,
        type: "reasoning",
        text: "",
        time: { start: now() },
      }
      pushPart(assistantID, reasoningPart)
      emit({
        type: "message.part.updated",
        properties: { part: { ...reasoningPart, time: { ...reasoningPart.time } } },
      })
      return reasoningPart
    }

    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      assistant.time.completed = now()
      textPart.time = { ...textPart.time, end: now() }
      appendEvent(sessionID, { type: "message", payload: assistant })
      appendEvent(sessionID, { type: "part", payload: textPart })
      emit({
        type: "message.part.updated",
        properties: { part: { ...textPart, time: { ...textPart.time } } },
      })
      if (reasoningPart !== undefined) {
        reasoningPart.time = { ...reasoningPart.time, end: now() }
        appendEvent(sessionID, { type: "part", payload: reasoningPart })
        emit({
          type: "message.part.updated",
          properties: { part: { ...reasoningPart, time: { ...reasoningPart.time } } },
        })
      }
      emit({ type: "message.updated", properties: { info: { ...assistant } } })
      emit({ type: "session.status", properties: { sessionID, status: { type: "idle" } } })
    }

    const onEvent = (event: AgentUiEvent) => {
      if (event.type === "text_delta") {
        textPart.text += event.text ?? ""
        appendEvent(sessionID, { type: "part", payload: textPart })
        emit({
          type: "message.part.updated",
          properties: { part: { ...textPart, time: { ...textPart.time } } },
        })
      } else if (event.type === "thinking_delta") {
        const part = ensureReasoningPart()
        part.text += event.text ?? ""
        appendEvent(sessionID, { type: "part", payload: part })
        emit({
          type: "message.part.updated",
          properties: { part: { ...part, time: { ...part.time } } },
        })
      } else if (event.type === "usage") {
        const usage = event.usage
        if (usage === undefined) return
        assistant.cost = usage.costTotal
        assistant.tokens = {
          total: usage.totalTokens,
          input: usage.input,
          output: usage.output,
          reasoning: 0,
          cache: { read: usage.cacheRead, write: usage.cacheWrite },
        }
        appendEvent(sessionID, { type: "message", payload: assistant })
        emit({ type: "message.updated", properties: { info: { ...assistant } } })
      } else if (event.type === "error") {
        emit({
          type: "session.error",
          properties: { sessionID, error: { name: "AgentError", data: { message: event.message } } },
        })
        finish()
      } else if (event.type === "done") {
        finish()
      }
    }

    void runtime
      .runPromise(
        Effect.gen(function* () {
          const agent = yield* AgentService
          if (
            typeof input.variant === "string" &&
            input.variant.length > 0 &&
            input.variant !== "default"
          ) {
            yield* agent.setThinkingLevel(input.variant)
          }
          yield* agent.run(text, onEvent)
        }),
      )
      .catch((cause: unknown) => {
        onEvent({ type: "error", message: cause instanceof Error ? cause.message : String(cause) })
      })

    void session
    return ok(undefined)
  }

  const session = {
    list: () =>
      ok(
        [...sessions.values()].sort(
          (a, b) => (b?.time?.updated ?? 0) - (a?.time?.updated ?? 0),
        ),
      ),
    create: (input: any) =>
      ok(
        storeSession({
          id: nextID("ses"),
          title: DEFAULT_SESSION_TITLE,
          directory: input?.directory ?? directory,
          time: { created: now(), updated: now() },
        }),
      ),
    get: (input: any) => ok(ensureSession(input.sessionID)),
    messages: (input: any) =>
      ok(
        (messagesBySession.get(input.sessionID) ?? []).map((info) => ({
          info,
          parts: partsByMessage.get(info.id) ?? [],
        })),
      ),
    todo: () => ok([]),
    diff: () => ok([]),
    status: () => ok({}),
    prompt: (input: any) => submitPrompt(input),
    chat: (input: any) => submitPrompt(input),
    fork: (input: any) => ok(ensureSession(input?.sessionID)),
    abort: () => ok(undefined),
    revert: () => ok(undefined),
    unrevert: () => ok(undefined),
    update: () => ok(undefined),
    delete: () => ok(undefined),
    summarize: () => ok(undefined),
    shell: () => ok(undefined),
    command: () => ok(undefined),
  }

  const client: any = {
    global: {
      event: (opts?: { signal?: AbortSignal }) => {
        const queue = new QueueStream<GlobalEvent>()
        const off = bus.add((event) => queue.push(event))
        opts?.signal?.addEventListener("abort", () => {
          off()
          queue.close()
        })
        return Promise.resolve({ stream: queue.stream() })
      },
      upgrade: () => ok({ success: true, version: "pi-flint" }),
    },
    session,
    config: {
      providers: async () => {
        const connected = await connectedProviders()
        return ok({ providers: providerList(connected), default: defaultModels(connected) })
      },
      get: async () => {
        const connected = await connectedProviders()
        const model = defaultModel(connected)
        return ok(model !== undefined ? { model } : {})
      },
      update: () => ok(undefined),
    },
    provider: {
      list: async () => {
        const connected = await connectedProviders()
        return ok({
          all: providerList(connected),
          default: defaultModels(connected),
          connected: [...connected],
        })
      },
      auth: () => {
        const methods: Record<string, any[]> = {}
        for (const plugin of allProviders()) {
          const providerAuth: any = (plugin.provider as any).auth
          const list: any[] = []
          if (providerAuth?.oauth) {
            list.push({ type: "oauth", label: providerAuth.oauth.name ?? plugin.provider.name })
          }
          if (providerAuth?.apiKey) {
            list.push({ type: "api", label: providerAuth.apiKey.name ?? "API key" })
          }
          if (list.length > 0) methods[plugin.provider.id] = list
        }
        return ok(methods)
      },
      oauth: { authorize: () => ok(undefined), callback: () => ok(undefined) },
    },
    app: { agents: () => ok(AGENTS) },
    command: { list: () => ok([]) },
    lsp: { status: () => ok([]) },
    mcp: { status: () => ok({}), connect: () => ok(undefined), disconnect: () => ok(undefined) },
    formatter: { status: () => ok([]) },
    vcs: { get: () => ok(undefined), status: () => ok(undefined) },
    path: {
      get: () =>
        ok({ home: directory, state: directory, config: directory, worktree: directory, directory }),
    },
    project: {
      current: () => ok({ id: directory, worktree: directory, mainDir: directory }),
      directories: () => ok([]),
    },
    permission: { reply: () => ok(undefined) },
    question: { reply: () => ok(undefined), reject: () => ok(undefined) },
    auth: {
      set: (input: any) => {
        const providerID = input?.providerID
        const credential = toCredential(input?.auth)
        if (typeof providerID !== "string" || credential === undefined) return ok(undefined)
        return Effect.runPromise(authStore.set(providerID, credential))
          .then(() => {
            if (credential.type === "api_key" && credential.key) {
              const envVar = AUTH_ENV_BY_PROVIDER[providerID]
              if (envVar) process.env[envVar] = credential.key
            }
            return ok(undefined)
          })
          .catch(() => ok(undefined))
      },
      remove: (input: any) => {
        const providerID = input?.providerID
        if (typeof providerID !== "string") return ok(undefined)
        return Effect.runPromise(authStore.delete(providerID))
          .then(() => {
            const envVar = AUTH_ENV_BY_PROVIDER[providerID]
            if (envVar) delete process.env[envVar]
            return ok(undefined)
          })
          .catch(() => ok(undefined))
      },
    },
    instance: { dispose: () => ok(undefined) },
    find: { files: () => ok([]) },
    sync: { start: () => ok(undefined) },
    experimental: {
      capabilities: { get: () => ok({ backgroundSubagents: false }) },
      console: {
        get: () => ok({ consoleManagedProviders: [], switchableOrgCount: 0 }),
        switchOrg: () => ok(undefined),
      },
      resource: { list: () => ok({}) },
      session: { background: () => ok(undefined) },
      workspace: {
        list: () => ok([]),
        status: () => ok([]),
        syncList: () => ok(undefined),
        create: () => ok(undefined),
        remove: () => ok(undefined),
        warp: () => ok(undefined),
        adapter: { list: () => ok([]) },
      },
    },
    v2: {
      location: { get: () => ok(location()) },
      session: {
        get: (input: any) => ok({ data: ensureSession(input.sessionID) }),
        messages: (input: any) =>
          ok({
            data: (messagesBySession.get(input.sessionID) ?? []).map((info) => ({
              info,
              parts: partsByMessage.get(info.id) ?? [],
            })),
          }),
        permission: { list: () => ok({ data: [] }) },
        question: { list: () => ok({ data: [] }) },
      },
      permission: { saved: { list: () => ok({ data: [] }) } },
      agent: { list: () => listResponse(AGENTS) },
      command: { list: () => listResponse([]) },
      integration: { list: () => listResponse([]) },
      model: {
        list: async () => {
          const connected = await connectedProviders()
          return listResponse(
            allProviders()
              .filter((plugin: any) => connected.has(plugin.provider.id))
              .flatMap((plugin: any) =>
                (plugin.provider.getModels?.() ?? []).map((model: any) => {
                  const mapped = mapModel(model, plugin.provider.id)
                  return {
                    id: model.id,
                    providerID: plugin.provider.id,
                    family: model.family,
                    name: model.name ?? model.id,
                    api: model.api,
                    capabilities: mapped.capabilities,
                    request: { headers: {}, body: {} },
                    variants: mapped.variants
                      ? Object.keys(mapped.variants).map((id) => ({ id, headers: {}, body: {} }))
                      : [],
                    time: { released: 0 },
                    cost: [],
                    status: "active",
                    enabled: true,
                    limit: mapped.limit,
                  }
                }),
              ),
          )
        },
      },
      provider: {
        list: async () => {
          const connected = await connectedProviders()
          return listResponse(
            allProviders()
              .filter((plugin: any) => connected.has(plugin.provider.id))
              .map((plugin: any) => ({
                id: plugin.provider.id,
                name: plugin.provider.name ?? plugin.provider.id,
                api: { type: "native", url: plugin.provider.baseUrl, settings: {} },
                request: { headers: {} },
              })),
          )
        },
      },
      reference: { list: () => listResponse([]) },
      skill: { list: () => listResponse([]) },
      fs: { find: () => ok([]) },
      projectCopy: { create: () => ok(undefined), refresh: () => ok(undefined) },
    },
  }

  return new Proxy(client, {
    get(target, prop) {
      if (typeof prop === "symbol") return (target as any)[prop]
      if (prop in target) return (target as any)[prop]
      return fallback[prop]
    },
  }) as unknown as PiFlintSdkClient
}
