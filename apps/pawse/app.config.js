// The desktop app builds a single-page web export, so the first render matches its window, not a server's.
module.exports = ({ config }) => ({
  ...config,
  web: {
    ...config.web,
    output: process.env.PAWSE_WEB_OUTPUT ?? config.web.output,
  },
});
