// Web preview only: browsers block cross-origin YouTube calls, so route them through the preview server.
export const appFetch: typeof fetch = (input, init) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  if (
    /^https:\/\/([a-z0-9-]+\.)*(youtube\.com|googlevideo\.com|jiosaavn\.com|kugou\.com|boidu\.dev)\//.test(
      url,
    )
  ) {
    return fetch(`/__proxy?u=${encodeURIComponent(url)}`, init);
  }
  return fetch(input, init);
};
