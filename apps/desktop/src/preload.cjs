// The page's only door into the desktop app: Google sign-in in its own window, the session kept encrypted, and the JS sandbox.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pawseDesktop", {
  signIn: () => ipcRenderer.invoke("pawse:sign-in"),
  signOut: () => ipcRenderer.invoke("pawse:sign-out"),
  // Synchronous, so the library has the session before its first request.
  readSession: () => ipcRenderer.sendSync("pawse:session-read"),
  writeSession: (cookies) => ipcRenderer.send("pawse:session-write", cookies),
  // JS in a hidden youtube.com page (sandbox.mjs): BotGuard tokens and player challenges.
  sandboxRun: (code, timeoutMs) =>
    ipcRenderer.invoke("pawse:sandbox-run", code, timeoutMs),
});
