/** @type {import("@commitlint/types").UserConfig} */
module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Bodies carry real reasoning and often quote error output; only the subject is bounded.
    "body-max-line-length": [0],
    "footer-max-line-length": [0],
    "header-max-length": [2, "always", 100],
    "scope-empty": [2, "never"],
  },
};
