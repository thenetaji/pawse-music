/**
 * Jest config for an app or package. `jest-expo` transforms the workspace packages too (they are TypeScript
 * source outside node_modules once symlinks are resolved). Pass `moduleNameMapper` for an app's `@/` alias.
 */
function createJestConfig(options = {}) {
  // Workspace packages are symlinked into node_modules, which jest-expo does not transform by default.
  const transformIgnorePatterns =
    require("jest-expo/jest-preset").transformIgnorePatterns.map((pattern) =>
      pattern.replace("(.pnpm|", "(.pnpm|@pawse|uniwind|"),
    );
  return {
    preset: "jest-expo",
    transformIgnorePatterns,
    testPathIgnorePatterns: ["/node_modules/", "/.reference/", "/dist/"],
    ...options,
  };
}

module.exports = { createJestConfig };
