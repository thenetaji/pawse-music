/**
 * Jest config for an app or package. `jest-expo` transforms the workspace packages too (they are TypeScript
 * source outside node_modules once symlinks are resolved). Pass `moduleNameMapper` for an app's `@/` alias.
 */
function createJestConfig(options = {}) {
  return {
    preset: 'jest-expo',
    testPathIgnorePatterns: ['/node_modules/', '/.reference/', '/dist/'],
    ...options,
  };
}

module.exports = { createJestConfig };
