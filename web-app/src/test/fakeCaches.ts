// Minimaler Cache Storage für jsdom (Offline-Karten).
class FakeCache {
  entries = new Map<string, { body: Blob; headers: [string, string][] }>();
  async match(url: string) {
    const e = this.entries.get(url);
    return e ? new Response(e.body, { headers: e.headers }) : undefined;
  }
  async put(url: string, res: Response) {
    this.entries.set(url, { body: await res.blob(), headers: [...res.headers.entries()] });
  }
}

export class FakeCacheStorage {
  caches = new Map<string, FakeCache>();
  async open(name: string) {
    let c = this.caches.get(name);
    if (!c) this.caches.set(name, (c = new FakeCache()));
    return c as unknown as Cache;
  }
  async match(url: string) {
    for (const c of this.caches.values()) {
      const hit = await c.match(url);
      if (hit) return hit;
    }
    return undefined;
  }
  async delete(name: string) {
    return this.caches.delete(name);
  }
  async keys() {
    return [...this.caches.keys()];
  }
  size(name: string) {
    return this.caches.get(name)?.entries.size ?? 0;
  }
}

export function installFakeCaches(): FakeCacheStorage {
  const store = new FakeCacheStorage();
  Object.defineProperty(globalThis, 'caches', { value: store, configurable: true, writable: true });
  return store;
}

export function removeFakeCaches() {
  delete (globalThis as { caches?: unknown }).caches;
}
