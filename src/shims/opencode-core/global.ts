import os from "os"
import path from "path"
import fs from "node:fs"
import { Context, Effect, Layer } from "effect"

const app = "pi-flint"
const root = path.join(os.homedir(), `.${app}`)

export interface PathShape {
  readonly home: string
  readonly data: string
  readonly bin: string
  readonly log: string
  readonly repos: string
  readonly cache: string
  readonly config: string
  readonly state: string
  readonly tmp: string
}

export const Path: PathShape = {
  home: root,
  data: path.join(root, "data"),
  bin: path.join(root, "bin"),
  log: path.join(root, "log"),
  repos: path.join(root, "repos"),
  cache: path.join(root, "cache"),
  config: path.join(root, "config"),
  state: path.join(root, "state"),
  tmp: path.join(os.tmpdir(), app),
}

export interface Interface {
  readonly home: string
  readonly data: string
  readonly cache: string
  readonly config: string
  readonly state: string
  readonly tmp: string
  readonly bin: string
  readonly log: string
  readonly repos: string
}

export class Service extends Context.Service<Service, Interface>()("@pi-flint/Global") {}

export function make(input: Partial<Interface> = {}): Interface {
  return {
    home: Path.home,
    data: Path.data,
    cache: Path.cache,
    config: process.env["PI_FLINT_CONFIG_DIR"] ?? Path.config,
    state: Path.state,
    tmp: Path.tmp,
    bin: Path.bin,
    log: Path.log,
    repos: Path.repos,
    ...input,
  }
}

function ensureDirs(): void {
  for (const dir of [Path.data, Path.config, Path.state, Path.tmp, Path.log, Path.bin, Path.repos, Path.cache]) {
    try {
      fs.mkdirSync(dir, { recursive: true })
    } catch {
    }
  }
}

const layer = Layer.effect(
  Service,
  Effect.sync(() => {
    ensureDirs()
    return Service.of(make())
  }),
)

export const layerWith = (input: Partial<Interface>) =>
  Layer.effect(
    Service,
    Effect.sync(() => {
      ensureDirs()
      return Service.of(make(input))
    }),
  )

export { layer }

export const Global = { Path, Service, make, layer, layerWith }
