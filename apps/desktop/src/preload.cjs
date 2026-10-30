// The page's only door into the desktop app: Google sign-in (Firefox or its own window), the session kept encrypted, and the JS sandbox.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pawseDesktop", {
  signIn: () => ipcRenderer.invoke("pawse:sign-in"),
  browserOpen: () => ipcRenderer.invoke("pawse:browser-open"),
  browserSignIn: () => ipcRenderer.invoke("pawse:browser-sign-in"),
  // Fresh cookies read from Firefox while Pawse runs.
  onSession: (cb) => {
    const on = (_e, cookies) => cb(cookies);
    ipcRenderer.on("pawse:session", on);
    return () => ipcRenderer.removeListener("pawse:session", on);
  },
  signOut: () => ipcRenderer.invoke("pawse:sign-out"),
  // Synchronous, so the library has the session before its first request.
  readSession: () => ipcRenderer.sendSync("pawse:session-read"),
  writeSession: (cookies) => ipcRenderer.send("pawse:session-write", cookies),
  // JS in a hidden youtube.com page (sandbox.mjs): BotGuard tokens and player challenges.
  sandboxRun: (code, timeoutMs) =>
    ipcRenderer.invoke("pawse:sandbox-run", code, timeoutMs),
  discordActivity: (np) => ipcRenderer.send("pawse:discord", np),
});
