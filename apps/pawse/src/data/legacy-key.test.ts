import { takeLegacy } from "./legacy-key";

const memory = (init: Record<string, string>) => {
  const m = new Map(Object.entries(init));
  return {
    m,
    get: (k: string) => m.get(k) ?? null,
    set: (k: string, v: string) => void m.set(k, v),
    remove: (k: string) => void m.delete(k),
  };
};

describe("takeLegacy", () => {
  it("moves an old flow.* value to its pawse.* key", () => {
    const s = memory({ "flow.library.v1": "{}" });
    expect(takeLegacy("pawse.library.v1", s)).toBe("{}");
    expect([...s.m]).toEqual([["pawse.library.v1", "{}"]]);
  });

  it("returns null when there is nothing to move or the key is not pawse.*", () => {
    const s = memory({ "flow.res": "x" });
    expect(takeLegacy("pawse.signals.v1", s)).toBeNull();
    expect(takeLegacy("res", s)).toBeNull();
    expect(s.m.size).toBe(1);
  });
});
