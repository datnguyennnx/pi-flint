import { describe, expect, it } from "vitest";
import { Registry } from "./registry.ts";

describe("Registry", () => {
  it("registers a value and gets it back by key", () => {
    const registry = new Registry<number>();
    registry.register("a", 1);
    expect(registry.get("a")).toBe(1);
  });

  it("reports has for known and unknown keys", () => {
    const registry = new Registry<string>();
    registry.register("known", "value");
    expect(registry.has("known")).toBe(true);
    expect(registry.has("missing")).toBe(false);
  });

  it("lists values and names in registration order", () => {
    const registry = new Registry<string>();
    registry.register("a", "1");
    registry.register("b", "2");
    expect(registry.list()).toEqual(["1", "2"]);
    expect(registry.names()).toEqual(["a", "b"]);
  });

  it("returns undefined for an unknown key", () => {
    const registry = new Registry<string>();
    expect(registry.get("nope")).toBeUndefined();
  });

  it("overwrites the stored value when a key is re-registered", () => {
    const registry = new Registry<number>();
    registry.register("k", 1);
    registry.register("k", 2);
    expect(registry.get("k")).toBe(2);
    expect(registry.list()).toEqual([2]);
    expect(registry.names()).toEqual(["k"]);
  });
});
