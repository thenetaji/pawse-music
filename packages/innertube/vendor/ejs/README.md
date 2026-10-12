# yt-dlp/ejs 0.8.0

The YouTube signature / n challenge solver from [yt-dlp/ejs](https://github.com/yt-dlp/ejs) (Unlicense), pinned to the exact release and SHA3-512 hashes that yt-dlp pins in `yt_dlp/extractor/youtube/jsc/_builtin/vendor/_info.py`.

Everything here is written by `pnpm sync:upstream` (scripts/sync-upstream.mjs), which refuses assets whose hashes do not match. Do not edit by hand.

- `generated/lib.ts`, `generated/core.ts`: `yt.solver.lib.min.js` and `yt.solver.core.min.js` as string modules, so Metro and Electron bundle them without loaders.
- `info.json`, `generated/info.ts`: version and hashes.
- `LICENSE`: yt-dlp/ejs licence. `THIRD_PARTY_LICENSES.txt`: the lib bundle's header with meriyah (ISC) and astring (MIT) notices.
