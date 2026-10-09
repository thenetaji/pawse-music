import { type FetchLike, fetchWithTimeout } from "../util/http";

/** One InnerTube client profile for the signed-out player endpoint. */
export interface StreamClient {
  name: string;
  clientName: string;
  clientNameId: number;
  clientVersion: string;
  userAgent: string;
  /** Extra `context.client` fields (device, OS). */
  context: Record<string, string>;
}

export const VISIONOS_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";

const visionos = (clientVersion: string): StreamClient => ({
  name: `visionos-${clientVersion}`,
  clientName: "VISIONOS",
  clientNameId: 101,
  clientVersion,
  userAgent: VISIONOS_UA,
  context: {
    deviceMake: "Apple",
    deviceModel: "RealityDevice17,1",
    osName: "visionOS",
    osVersion: "26.5.23O471",
  },
});

/** Built-in order; mirrored in sources/innertube-clients.json at the repo root. */
export const DEFAULT_STREAM_CLIENTS: StreamClient[] = [
  visionos("1.02"),
  visionos("1.03"),
  visionos("1.01"),
];

export const DEFAULT_CLIENTS_CONFIG_URL =
  "https://raw.githubusercontent.com/thenetaji/flow-music/main/sources/innertube-clients.json";

const CONFIG_TTL_MS = 6 * 3600_000;
const ERROR_TTL_MS = 10 * 60_000;
const CONFIG_TIMEOUT_MS = 2500;

/** Validates a remote config; undefined when it is unusable. */
export function parseClientsConfig(json: unknown): StreamClient[] | undefined {
  const list = (json as { clients?: unknown })?.clients;
  if (!Array.isArray(list)) return undefined;
  const clients = list.filter(
    (c): c is StreamClient =>
      !!c &&
      typeof c.clientName === "string" &&
      typeof c.clientVersion === "string" &&
      typeof c.clientNameId === "number" &&
      typeof c.userAgent === "string",
  );
  if (!clients.length) return undefined;
  return clients.map((c) => ({
    name:
      typeof c.name === "string"
        ? c.name
        : `${c.clientName.toLowerCase()}-${c.clientVersion}`,
    clientName: c.clientName,
    clientNameId: c.clientNameId,
    clientVersion: c.clientVersion,
    userAgent: c.userAgent,
    context: c.context && typeof c.context === "object" ? c.context : {},
  }));
}

/** Remote client list, cached 6 h; any failure falls back to the built-in list. */
export class ClientsConfig {
  private cached?: { clients: StreamClient[]; until: number };
  private pending?: Promise<StreamClient[]>;

  private readonly fetchFn: FetchLike;
  private readonly url: string | null;
  private readonly fallback: StreamClient[];

  constructor(
    fetchFn: FetchLike,
    url: string | null,
    fallback: StreamClient[] = DEFAULT_STREAM_CLIENTS,
  ) {
    this.fetchFn = fetchFn;
    this.url = url;
    this.fallback = fallback;
  }

  async get(): Promise<StreamClient[]> {
    if (!this.url) return this.fallback;
    if (this.cached && this.cached.until > Date.now())
      return this.cached.clients;
    this.pending ??= this.load().finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }

  private async load(): Promise<StreamClient[]> {
    try {
      const res = await fetchWithTimeout(
        this.fetchFn,
        this.url!,
        { credentials: "omit" },
        CONFIG_TIMEOUT_MS,
      );
      if (!res.ok) throw new Error(`clients config ${res.status}`);
      const clients = parseClientsConfig(await res.json());
      if (!clients) throw new Error("clients config has no usable clients");
      this.cached = { clients, until: Date.now() + CONFIG_TTL_MS };
    } catch {
      this.cached = {
        clients: this.fallback,
        until: Date.now() + ERROR_TTL_MS,
      };
    }
    return this.cached.clients;
  }
}
