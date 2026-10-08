const { createJestConfig } = require("@studio/config/jest");

module.exports = createJestConfig({
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
});
