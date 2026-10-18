// localStorage de mentira para os testes (em Node não existe). Permite simular o limite de espaço
// do navegador: com `limitChars` definido, gravar além dele lança o mesmo erro de cota cheia.

class MemoryStorage {
  private data = new Map<string, string>();
  limitChars: number | null = null;

  get length() {
    return this.data.size;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.limitChars !== null) {
      let total = value.length;
      for (const [existing, text] of this.data) if (existing !== key) total += text.length;
      if (total > this.limitChars) throw new DOMException("cota cheia", "QuotaExceededError");
    }
    this.data.set(key, String(value));
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  clear() {
    this.data.clear();
  }
}

export const testStorage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", { value: testStorage, configurable: true });
