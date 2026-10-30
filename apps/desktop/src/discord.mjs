// "Listening to Pawse" on Discord, over the desktop client's local IPC socket (no Discord library, no network).
import net from "node:net";
import path from "node:path";

const RETRY_MS = 15_000;

function socketPaths() {
  if (process.platform === "win32")
    return Array.from(
      { length: 10 },
      (_, i) => `\\\\?\\pipe\\discord-ipc-${i}`,
    );
  const env = process.env;
  const bases = [env.XDG_RUNTIME_DIR, env.TMPDIR, env.TMP, env.TEMP, "/tmp"]
    .filter(Boolean)
    // Flatpak and Snap Discord put the socket one folder down.
    .flatMap((b) => [
      b,
      path.join(b, "app/com.discordapp.Discord"),
      path.join(b, "snap.discord"),
    ]);
  return bases.flatMap((b) =>
    Array.from({ length: 10 }, (_, i) => path.join(b, `discord-ipc-${i}`)),
  );
}

function frame(op, body) {
  const json = Buffer.from(JSON.stringify(body));
  const head = Buffer.alloc(8);
  head.writeInt32LE(op, 0);
  head.writeInt32LE(json.length, 4);
  return Buffer.concat([head, json]);
}

function connectAt(file, clientId) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection(file);
    const fail = () => {
      sock.destroy();
      reject(new Error("no discord"));
    };
    sock.once("error", fail);
    sock.once("connect", () =>
      sock.write(frame(0, { v: 1, client_id: clientId })),
    );
    sock.once("data", (data) => {
      const reply = JSON.parse(data.subarray(8).toString() || "{}");
      if (reply.evt !== "READY") return fail();
      sock.removeListener("error", fail);
      resolve(sock);
    });
  });
}

export function discordPresence(clientId) {
  let sock;
  let tried = 0;
  let last;
  let nonce = 0;

  async function ensure() {
    if (sock && !sock.destroyed) return sock;
    if (Date.now() - tried < RETRY_MS) return undefined;
    tried = Date.now();
    for (const file of socketPaths()) {
      try {
        sock = await connectAt(file, clientId);
        sock.on("close", () => (sock = undefined));
        sock.on("error", () => sock?.destroy());
        sock.on("data", () => {});
        return sock;
      } catch {}
    }
    return undefined;
  }

  return {
    async update(np) {
      const key = JSON.stringify(np ?? null);
      if (key === last) return;
      const s = await ensure();
      if (!s) return;
      last = key;
      const activity = np && {
        type: 2,
        details: np.title.slice(0, 128),
        state: (np.artist || "Pawse").slice(0, 128),
        ...(np.start && np.end
          ? { timestamps: { start: np.start, end: np.end } }
          : {}),
        assets: {
          large_image: np.artwork?.startsWith("https://")
            ? np.artwork
            : "pawse",
          large_text: (np.album || np.title).slice(0, 128),
        },
      };
      s.write(
        frame(1, {
          cmd: "SET_ACTIVITY",
          args: { pid: process.pid, activity: activity || undefined },
          nonce: String(++nonce),
        }),
      );
    },
    close() {
      sock?.destroy();
    },
  };
}
