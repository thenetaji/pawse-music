import { CHUNK_CHARS, SandboxBridge } from "./sandbox-bridge";

// A fake page: remembers chunks per id and answers __pw.r with the code's length.
function setup() {
  const bridge = new SandboxBridge();
  const sent: string[] = [];
  const store: Record<string, string> = {};
  const inject = (js: string) => {
    sent.push(js);
    const c = js.match(/^__pw\.c\((\d+),(".*")\);true;$/s);
    if (c) store[c[1]] = (store[c[1]] ?? "") + JSON.parse(c[2]);
    const r = js.match(/^__pw\.r\((\d+)\);true;$/);
    if (r)
      queueMicrotask(() =>
        bridge.onMessage(JSON.stringify({ id: Number(r[1]), ok: true, v: store[r[1]].length })),
      );
  };
  return { bridge, sent, store, inject };
}

describe("SandboxBridge", () => {
  it("sends big code in ordered chunks and reassembles it exactly", async () => {
    const { bridge, sent, store, inject } = setup();
    bridge.attach(inject);
    const code = `return "${"é 😀\\\"x".repeat(CHUNK_CHARS)}";`;
    expect(await bridge.run<number>(code)).toBe(code.length);
    const chunks = sent.filter((s) => s.startsWith("__pw.c("));
    expect(chunks.length).toBe(Math.ceil(code.length / CHUNK_CHARS));
    expect(store["1"]).toBe(code);
    expect(sent[sent.length - 1]).toBe("__pw.r(1);true;");
  });

  it("queues calls until the page attaches", async () => {
    const { bridge, sent, inject } = setup();
    const p = bridge.run<number>("abc");
    expect(sent).toEqual([]);
    bridge.attach(inject);
    expect(await p).toBe(3);
  });

  it("rejects queued calls when the page never loads", async () => {
    jest.useFakeTimers();
    try {
      const { bridge } = setup();
      const p = bridge.run("x");
      const caught = p.catch((e: Error) => e.message);
      jest.advanceTimersByTime(15_001);
      expect(await caught).toBe("sandbox did not load");
    } finally {
      jest.useRealTimers();
    }
  });

  it("fails in-flight calls when the page dies and keeps queued ones for the next page", async () => {
    const { bridge, inject } = setup();
    const quiet = (js: string) => void js; // never answers
    bridge.attach(quiet);
    const inflight = bridge.run("a").catch((e: Error) => e.message);
    bridge.detach("web view process gone");
    expect(await inflight).toBe("web view process gone");
    const queued = bridge.run<number>("bcd");
    bridge.attach(inject);
    expect(await queued).toBe(3);
  });

  it("times out a run, tells the page to drop it, and maps page errors", async () => {
    jest.useFakeTimers();
    try {
      const { bridge, sent } = setup();
      bridge.attach((js) => void sent.push(js));
      const slow = bridge.run("a", 1000).catch((e: Error) => e.message);
      jest.advanceTimersByTime(1001);
      expect(await slow).toMatch(/timed out after 1000/);
      expect(sent).toContain("__pw.x(1);true;");
      const bad = bridge.run("b").catch((e: Error) => e.message);
      bridge.onMessage(JSON.stringify({ id: 2, ok: false, e: "boom" }));
      expect(await bad).toBe("boom");
    } finally {
      jest.useRealTimers();
    }
  });
});
