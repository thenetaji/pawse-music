// Builds the app's single-page web export into apps/desktop/web (works the same on every OS).
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";

const here = import.meta.dirname;
const out = join(here, "..", "web");
rmSync(out, { recursive: true, force: true });
const r = spawnSync(
  "pnpm",
  ["exec", "expo", "export", "-p", "web", "--output-dir", out],
  {
    cwd: join(here, "..", "..", "pawse"),
    env: { ...process.env, PAWSE_WEB_OUTPUT: "single" },
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);
process.exit(r.status ?? 1);
