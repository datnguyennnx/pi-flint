export interface FlockGlobal {
  state: string
}

export interface Lease {
  release: () => Promise<void>
  [Symbol.asyncDispose]: () => Promise<void>
}

export const Flock = {
  setGlobal(_g: FlockGlobal): void {
  },
  async acquire(_key: string, _input?: unknown): Promise<Lease> {
    const release = async () => {}
    return {
      release,
      [Symbol.asyncDispose]() {
        return release()
      },
    }
  },
  async withLock<T>(_key: string, fn: () => Promise<T>, _input?: unknown): Promise<T> {
    return await fn()
  },
  effect: {} as any,
}
