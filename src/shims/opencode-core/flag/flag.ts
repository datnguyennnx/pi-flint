function truthy(key: string): boolean {
  const value = process.env[key]?.toLowerCase()
  return value === "true" || value === "1"
}

function enabledByExperimental(key: string): boolean {
  return process.env[key] === undefined ? truthy("PI_FLINT_EXPERIMENTAL") : truthy(key)
}

export const Flag: Record<string, any> = {
  OTEL_EXPORTER_OTLP_ENDPOINT: process.env["OTEL_EXPORTER_OTLP_ENDPOINT"],
  PI_FLINT_AUTO_HEAP_SNAPSHOT: truthy("PI_FLINT_AUTO_HEAP_SNAPSHOT"),
  PI_FLINT_GIT_BASH_PATH: process.env["PI_FLINT_GIT_BASH_PATH"],
  PI_FLINT_CONFIG: process.env["PI_FLINT_CONFIG"],
  PI_FLINT_DISABLE_AUTOUPDATE: truthy("PI_FLINT_DISABLE_AUTOUPDATE"),
  PI_FLINT_DISABLE_TERMINAL_TITLE: truthy("PI_FLINT_DISABLE_TERMINAL_TITLE"),
  PI_FLINT_SHOW_TTFD: truthy("PI_FLINT_SHOW_TTFD"),
  PI_FLINT_DISABLE_AUTOCOMPACT: truthy("PI_FLINT_DISABLE_AUTOCOMPACT"),
  PI_FLINT_DISABLE_MODELS_FETCH: truthy("PI_FLINT_DISABLE_MODELS_FETCH"),
  PI_FLINT_DISABLE_MOUSE: truthy("PI_FLINT_DISABLE_MOUSE"),
  PI_FLINT_FAST_BOOT:
    process.env["PI_FLINT_FAST_BOOT"] === undefined ? true : truthy("PI_FLINT_FAST_BOOT"),
  PI_FLINT_FAKE_VCS: process.env["PI_FLINT_FAKE_VCS"],
  PI_FLINT_SERVER_PASSWORD: process.env["PI_FLINT_SERVER_PASSWORD"],
  PI_FLINT_SERVER_USERNAME: process.env["PI_FLINT_SERVER_USERNAME"],
  PI_FLINT_DISABLE_FFF:
    process.env["PI_FLINT_DISABLE_FFF"] === undefined
      ? process.platform === "win32"
      : truthy("PI_FLINT_DISABLE_FFF"),
  PI_FLINT_EXPERIMENTAL_FILEWATCHER: truthy("PI_FLINT_EXPERIMENTAL_FILEWATCHER"),
  PI_FLINT_EXPERIMENTAL_DISABLE_FILEWATCHER: truthy("PI_FLINT_EXPERIMENTAL_DISABLE_FILEWATCHER"),
  PI_FLINT_EXPERIMENTAL_DISABLE_COPY_ON_SELECT:
    process.env["PI_FLINT_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"] === undefined
      ? process.platform === "win32"
      : truthy("PI_FLINT_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"),
  PI_FLINT_MODELS_URL: process.env["PI_FLINT_MODELS_URL"],
  PI_FLINT_MODELS_PATH: process.env["PI_FLINT_MODELS_PATH"],
  PI_FLINT_DB: process.env["PI_FLINT_DB"],
  PI_FLINT_WORKSPACE_ID: process.env["PI_FLINT_WORKSPACE_ID"],
  PI_FLINT_EXPERIMENTAL_WORKSPACES: enabledByExperimental("PI_FLINT_EXPERIMENTAL_WORKSPACES"),
  get PI_FLINT_DISABLE_PROJECT_CONFIG() {
    return truthy("PI_FLINT_DISABLE_PROJECT_CONFIG")
  },
  get PI_FLINT_EXPERIMENTAL_REFERENCES() {
    return enabledByExperimental("PI_FLINT_EXPERIMENTAL_REFERENCES")
  },
  get PI_FLINT_TUI_CONFIG() {
    return process.env["PI_FLINT_TUI_CONFIG"]
  },
  get PI_FLINT_CONFIG_DIR() {
    return process.env["PI_FLINT_CONFIG_DIR"]
  },
  get PI_FLINT_PURE() {
    return truthy("PI_FLINT_PURE")
  },
  get PI_FLINT_PERMISSION() {
    return process.env["PI_FLINT_PERMISSION"]
  },
  get PI_FLINT_PLUGIN_META_FILE() {
    return process.env["PI_FLINT_PLUGIN_META_FILE"]
  },
  get PI_FLINT_CLIENT() {
    return process.env["PI_FLINT_CLIENT"] ?? "cli"
  },
}
