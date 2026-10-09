const { createJestConfig } = require("@pawse/config/jest");

module.exports = createJestConfig({
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
});
