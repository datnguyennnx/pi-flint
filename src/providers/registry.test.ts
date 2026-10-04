import type { Provider } from "@earendil-works/pi-ai";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { createHost } from "../core/index.ts";
import { allProviders } from "./index.ts";
import { providerPlugin } from "./registry.ts";

describe("allProviders", () => {
  it("returns the three built-in adapters in order", () => {
    const plugins = allProviders();
    expect(plugins).toHaveLength(3);
    expect(plugins.map((plugin) => plugin.name)).toEqual([
      "opencode",
      "opencode-go",
      "coralbricks",
    ]);
  });

  it("gives each adapter a provider and a setup function", () => {
    for (const plugin of allProviders()) {
      expect(plugin.provider).toBeDefined();
      expect(typeof plugin.setup).toBe("function");
    }
  });
});

describe("providerPlugin", () => {
  it("registers its provider on a host when setup runs", () => {
    const host = createHost();
    const provider = { id: "fake" } as unknown as Provider;
    const plugin = providerPlugin("fake", provider);
    expect(plugin.name).toBe("fake");
    Effect.runSync(plugin.setup(host));
    expect(host.getProvider("fake")).toBe(provider);
  });
});
