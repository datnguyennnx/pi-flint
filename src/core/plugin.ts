import type { Effect } from "effect";
import type { HostShape } from "./host.ts";

export interface Plugin {
  name: string;
  setup(host: HostShape): Effect.Effect<void>;
}
