const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");

/**
 * Metro config for a studio app. Expo detects the pnpm monorepo by itself (watch folders, node_modules
 * lookup), so workspace packages resolve and are transformed from their TypeScript source.
 * `uniwind` options are the app's own CSS entry and generated typings file.
 */
function createMetroConfig(projectRoot, uniwind) {
  const config = getDefaultConfig(projectRoot);

  // expo-sqlite on web ships a wasm binary; drizzle migrations are .sql files.
  config.resolver.assetExts.push("wasm");
  config.resolver.sourceExts.push("sql");

  // @rntp/player's web build may import shaka-player for DASH/HLS; Pawse plays plain files, so it stays out.
  const resolve = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, name, platform) =>
    name === "shaka-player"
      ? { type: "empty" }
      : (resolve ?? context.resolveRequest)(context, name, platform);

  // expo-sqlite web needs SharedArrayBuffer, which needs cross-origin isolation.
  config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    return middleware(req, res, next);
  };

  return withUniwindConfig(config, uniwind);
}

module.exports = { createMetroConfig };
