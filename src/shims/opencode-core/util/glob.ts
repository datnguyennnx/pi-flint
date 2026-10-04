export interface GlobOptions {
  cwd?: string
  absolute?: boolean
  include?: "file" | "all"
  dot?: boolean
  symlink?: boolean
}

export const Glob = {
  async scan(_pattern: string, _options: GlobOptions = {}): Promise<string[]> {
    return []
  },
  scanSync(_pattern: string, _options: GlobOptions = {}): string[] {
    return []
  },
  match(_pattern: string, _filepath: string): boolean {
    return false
  },
}
