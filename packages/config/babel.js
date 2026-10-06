// The one Babel setup for apps and packages. babel-preset-expo adds the React Compiler (from the app's
// `experiments.reactCompiler`), the Reanimated/worklets plugin and the Uniwind transforms.
// Each app and each package that runs jest has a babel.config.js that re-exports this, because Babel only
// reads a root config from the directory it is started in.
module.exports = function babelConfig(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Lets drizzle migration .sql files be imported as strings.
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
