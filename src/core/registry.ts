export class Registry<T> {
  readonly #values = new Map<string, T>();

  register(name: string, value: T): void {
    this.#values.set(name, value);
  }

  get(name: string): T | undefined {
    return this.#values.get(name);
  }

  has(name: string): boolean {
    return this.#values.has(name);
  }

  list(): readonly T[] {
    return [...this.#values.values()];
  }

  names(): readonly string[] {
    return [...this.#values.keys()];
  }
}
