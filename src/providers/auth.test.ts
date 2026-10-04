import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Credential } from "@earendil-works/pi-ai";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAuthStore } from "./auth.ts";

const API_KEY = "sk-test-secret-value";

describe("AuthStore", () => {
  let home: string;
  let authPath: string;
  let previousHome: string | undefined;
  let store: ReturnType<typeof createAuthStore>;

  beforeEach(() => {
    previousHome = process.env.HOME;
    home = mkdtempSync(join(tmpdir(), "pi-flint-auth-"));
    process.env.HOME = home;
    authPath = join(home, ".pi-flint", "auth.json");
    store = createAuthStore(authPath);
  });

  afterEach(() => {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    rmSync(home, { recursive: true, force: true });
  });

  it("round-trips a credential through set and get", async () => {
    const credential: Credential = { type: "api_key", key: API_KEY };
    await Effect.runPromise(store.set("opencode", credential));
    expect(await Effect.runPromise(store.get("opencode"))).toEqual(credential);
  });

  it("lists the ids that have credentials", async () => {
    await Effect.runPromise(store.set("opencode", { type: "api_key", key: API_KEY }));
    await Effect.runPromise(store.set("opencode-go", { type: "api_key", key: "other" }));
    expect(await Effect.runPromise(store.list())).toEqual(["opencode", "opencode-go"]);
  });

  it("removes a credential on delete", async () => {
    await Effect.runPromise(store.set("opencode", { type: "api_key", key: API_KEY }));
    await Effect.runPromise(store.delete("opencode"));
    expect(await Effect.runPromise(store.get("opencode"))).toBeUndefined();
    expect(await Effect.runPromise(store.list())).not.toContain("opencode");
  });

  it("creates the auth file 0o600 and its directory 0o700", async () => {
    await Effect.runPromise(store.set("opencode", { type: "api_key", key: API_KEY }));
    expect(statSync(authPath).mode & 0o777).toBe(0o600);
    expect(statSync(join(home, ".pi-flint")).mode & 0o777).toBe(0o700);
  });

  it("returns undefined for an unknown provider", async () => {
    expect(await Effect.runPromise(store.get("missing"))).toBeUndefined();
  });

  it("keeps the raw key in the file but out of the list shape", async () => {
    await Effect.runPromise(store.set("opencode", { type: "api_key", key: API_KEY }));
    expect(readFileSync(authPath, "utf8")).toContain(API_KEY);
    const listed = await Effect.runPromise(store.list());
    expect(listed).toContain("opencode");
    expect(listed.join(",")).not.toContain(API_KEY);
  });
});
