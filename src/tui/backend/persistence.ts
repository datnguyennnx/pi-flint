import fs from "node:fs"
import os from "node:os"
import path from "node:path"

export type PersistedEventType = "session" | "message" | "part"

export interface PersistedEvent {
  type: PersistedEventType
  payload: any
}

export function sessionsDir(): string {
  const override = process.env.PI_FLINT_SESSIONS_DIR
  const home = process.env.PI_FLINT_HOME
  const dir = override
    ? override
    : home
      ? path.join(home, "sessions")
      : path.join(os.homedir(), ".pi-flint", "sessions")
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function sessionFile(sessionId: string): string {
  return path.join(sessionsDir(), `${sessionId}.jsonl`)
}

export function appendEvent(sessionId: string, event: PersistedEvent): void {
  if (process.env.PI_FLINT_NO_PERSIST) return
  try {
    fs.appendFileSync(sessionFile(sessionId), `${JSON.stringify(event)}\n`, "utf8")
  } catch {
  }
}

export function readSession(sessionId: string): PersistedEvent[] {
  let raw: string
  try {
    raw = fs.readFileSync(sessionFile(sessionId), "utf8")
  } catch {
    return []
  }
  const events: PersistedEvent[] = []
  for (const line of raw.split("\n")) {
    if (line.trim() === "") continue
    try {
      const parsed = JSON.parse(line)
      if (
        parsed !== null &&
        typeof parsed === "object" &&
        typeof parsed.type === "string" &&
        "payload" in parsed
      ) {
        events.push(parsed as PersistedEvent)
      }
    } catch {
    }
  }
  return events
}

export function listSessionIds(): string[] {
  try {
    return fs
      .readdirSync(sessionsDir())
      .filter((name) => name.endsWith(".jsonl"))
      .map((name) => name.slice(0, -".jsonl".length))
  } catch {
    return []
  }
}
