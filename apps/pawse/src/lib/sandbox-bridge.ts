import type { JsSandbox } from "@pawse/innertube";

// Chunks stay well under what injectJavaScript handles on Android and iOS (EJS code alone is ~4 MB).
export const CHUNK_CHARS = 256 * 1024;
const RUN_MS = 20_000;
const READY_MS = 15_000;

/** Page side of the bridge: collects chunks per request id, runs them as an async function body, posts the result. */
export const SANDBOX_PAGE_HTML = `<!doctype html><html><head><meta charset="utf-8"></head><body><script>
(function () {
  var parts = {};
  var AF = Object.getPrototypeOf(async function () {}).constructor;
  function post(o) { window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
  window.__pw = {
    c: function (id, s) { parts[id] = (parts[id] || "") + s; },
    x: function (id) { delete parts[id]; },
    r: function (id) {
      var code = parts[id] || "";
      delete parts[id];
      Promise.resolve().then(function () { return new AF(code)(); }).then(
        function (v) {
          try { post({ id: id, ok: true, v: v === undefined ? null : v }); }
          catch (e) { post({ id: id, ok: false, e: "result not serialisable" }); }
        },
        function (e) { post({ id: id, ok: false, e: String((e && e.message) || e) }); }
      );
    }
  };
  post({ ready: true });
})();
</script></body></html>`;

interface Call {
  id: number;
  code: string;
  timeoutMs: number;
  resolve(v: unknown): void;
  reject(e: Error): void;
  /** Ready-wait timer while queued, run timer once sent. */
  timer?: ReturnType<typeof setTimeout>;
  sent: boolean;
}

/** JsSandbox over a WebView-like transport: queues until the page is ready, sends code in chunks, matches answers by id. */
export class SandboxBridge implements JsSandbox {
  private inject?: (js: string) => void;
  private readonly calls = new Map<number, Call>();
  private seq = 0;

  /** The page announced itself (or loaded again): sends everything queued. */
  attach(inject: (js: string) => void): void {
    // A page announcing itself again has lost whatever the last one was running.
    this.detach("sandbox page reloaded");
    this.inject = inject;
    for (const c of this.calls.values()) if (!c.sent) this.send(c);
  }

  /** The page is gone (process killed, remounted): calls it was running fail, queued ones wait for the next page. */
  detach(reason: string): void {
    this.inject = undefined;
    for (const c of [...this.calls.values()]) if (c.sent) this.settle(c, new Error(reason));
  }

  /** Feeds a message from the page. */
  onMessage(data: string): void {
    let m: { id?: number; ok?: boolean; v?: unknown; e?: string; ready?: boolean };
    try {
      m = JSON.parse(data);
    } catch {
      return;
    }
    if (m.ready) return;
    const c = typeof m.id === "number" ? this.calls.get(m.id) : undefined;
    if (!c) return;
    this.settle(c, m.ok ? undefined : new Error(m.e || "sandbox error"), m.v);
  }

  run<T = unknown>(code: string, timeoutMs = RUN_MS): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const c: Call = {
        id: ++this.seq,
        code,
        timeoutMs,
        resolve: resolve as (v: unknown) => void,
        reject,
        sent: false,
      };
      this.calls.set(c.id, c);
      if (this.inject) this.send(c);
      else
        c.timer = setTimeout(
          () => this.settle(c, new Error("sandbox did not load")),
          READY_MS,
        );
    });
  }

  private send(c: Call): void {
    const inject = this.inject;
    if (!inject) return;
    clearTimeout(c.timer);
    c.sent = true;
    c.timer = setTimeout(
      () => this.settle(c, new Error(`sandbox run timed out after ${c.timeoutMs} ms`)),
      c.timeoutMs,
    );
    try {
      for (let i = 0; i < c.code.length; i += CHUNK_CHARS)
        inject(`__pw.c(${c.id},${JSON.stringify(c.code.slice(i, i + CHUNK_CHARS))});true;`);
      inject(`__pw.r(${c.id});true;`);
    } catch (e) {
      this.settle(c, e instanceof Error ? e : new Error(String(e)));
    }
  }

  private settle(c: Call, err?: Error, value?: unknown): void {
    if (!this.calls.delete(c.id)) return;
    clearTimeout(c.timer);
    // Timed out or failed before the page ran it: drop what was sent.
    if (err && c.sent) {
      try {
        this.inject?.(`__pw.x(${c.id});true;`);
      } catch {}
    }
    if (err) c.reject(err);
    else c.resolve(value);
  }
}
