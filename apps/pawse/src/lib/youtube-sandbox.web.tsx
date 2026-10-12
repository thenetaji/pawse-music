import type { JsSandbox } from "@pawse/innertube";

import { desktop } from "./desktop";

const bridge = desktop?.sandboxRun?.bind(desktop);

/** Desktop app only: a hidden window in its main process (apps/desktop/src/sandbox.mjs). A plain browser has none. */
export const youtubeSandbox: JsSandbox | undefined = bridge && {
  run: <T,>(code: string, timeoutMs?: number) =>
    bridge(code, timeoutMs) as Promise<T>,
};

export const YouTubeSandboxHost = () => null;
