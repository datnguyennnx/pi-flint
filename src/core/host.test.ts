import type { Provider } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import { createHost } from "./host.ts";
import type { Command, UiSlot } from "./host.ts";

describe("createHost", () => {
  it("returns a fresh host with empty registries", () => {
    const host = createHost();
    expect(host.listProviders()).toEqual([]);
    expect(host.listCommands()).toEqual([]);
    expect(host.listUi()).toEqual([]);
  });

  it("retrieves a registered provider by name", () => {
    const host = createHost();
    const provider = { id: "opencode" } as unknown as Provider;
    host.registerProvider("opencode", provider);
    expect(host.getProvider("opencode")).toBe(provider);
    expect(host.listProviders()).toEqual([provider]);
  });

  it("retrieves a registered command by name", () => {
    const host = createHost();
    const command: Command = { name: "hello", run() {} };
    host.registerCommand(command);
    expect(host.getCommand("hello")).toBe(command);
    expect(host.listCommands()).toEqual([command]);
  });

  it("retrieves a registered ui slot by name", () => {
    const host = createHost();
    const slot: UiSlot = { name: "panel", render: () => "panel" };
    host.registerUi(slot);
    expect(host.getUi("panel")).toBe(slot);
    expect(host.listUi()).toEqual([slot]);
  });

  it("returns undefined for unknown lookups", () => {
    const host = createHost();
    expect(host.getProvider("missing")).toBeUndefined();
    expect(host.getCommand("missing")).toBeUndefined();
    expect(host.getUi("missing")).toBeUndefined();
  });
});
