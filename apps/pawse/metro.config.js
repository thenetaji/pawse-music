const { createMetroConfig } = require("@pawse/config/metro");

module.exports = createMetroConfig(__dirname, {
  cssEntryFile: "./src/global.css",
  dtsFile: "./src/uniwind-types.d.ts",
});
