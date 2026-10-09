import * as Network from "expo-network";
import { create } from "zustand";

// Native fetch talks to YouTube directly.
export const appFetch: typeof fetch = (input, init) => fetch(input, init);

export type NetworkKind = "wifi" | "cellular" | "offline" | "unknown";

function kindOf(s: Network.NetworkState): NetworkKind {
  if (s.isConnected === false || s.isInternetReachable === false)
    return "offline";
  const T = Network.NetworkStateType;
  if (s.type === T.WIFI || s.type === T.ETHERNET) return "wifi";
  if (s.type === T.CELLULAR) return "cellular";
  return s.type === T.NONE ? "offline" : "unknown";
}

// One cached network type, kept fresh by the listener so sync callers (the resolver) stay cheap.
export const networkStore = create<{ kind: NetworkKind }>(() => ({
  kind: "unknown",
}));
const update = (s: Network.NetworkState) => {
  const kind = kindOf(s);
  if (kind !== networkStore.getState().kind) networkStore.setState({ kind });
};
Network.getNetworkStateAsync()
  .then(update)
  .catch(() => {});
Network.addNetworkStateListener(update);

export const networkKind = (): NetworkKind => networkStore.getState().kind;

/** Asks the OS now (for gates that must not trust a stale value) and refreshes the cache. */
export async function refreshNetworkKind(): Promise<NetworkKind> {
  const s = await Network.getNetworkStateAsync();
  update(s);
  return kindOf(s);
}
