import type { JsSandbox } from "../sandbox";

/** The slice of `node:vm` the sandbox needs; passed in so Metro never sees a node: import. */
export interface VmLike {
  createContext(sandbox?: object): object;
  runInContext(
    code: string,
    context: object,
    options?: { timeout?: number },
  ): unknown;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/** node:vm of the running Node, found without a static import so Metro never sees one. */
function nodeVm(): VmLike {
  const get = (globalThis as any).process?.getBuiltinModule;
  const vm = typeof get === "function" ? get("node:vm") : undefined;
  if (!vm) throw new Error("createNodeSandbox needs Node 22+ or a vm module");
  return vm;
}

/** JsSandbox on a fresh node:vm context (tests, scripts); pass `vm` where getBuiltinModule is missing. */
export function createNodeSandbox(vm: VmLike = nodeVm()): JsSandbox {
  const ctx = vm.createContext({});
  return {
    async run<T>(code: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
      // The synchronous part (all of EJS) runs under vm's own timeout; the race covers awaits.
      const pending = vm.runInContext(
        `(async function () {\n${code}\n})()`,
        ctx,
        { timeout: timeoutMs },
      ) as Promise<unknown>;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`sandbox timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      });
      try {
        const out = await Promise.race([pending, timeout]);
        return (
          out === undefined ? undefined : JSON.parse(JSON.stringify(out))
        ) as T;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
