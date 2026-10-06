const { defineConfig } = require('eslint/config');
const expo = require('eslint-config-expo/flat');

/** Flat ESLint config shared by every app and package; `ignores` adds per-project globs. */
function createEslintConfig(ignores = []) {
  return defineConfig([expo, { ignores: ['dist/*', '.screenshots/*', '.export-*/*', ...ignores] }]);
}

module.exports = { createEslintConfig };
