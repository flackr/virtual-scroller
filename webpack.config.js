const path = require('path');

function getCommonConfig() {
  return {
    entry: [],
    devtool: 'source-map',
    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: {
            loader: "babel-loader"
          }
        }
      ]
    },
  };
}

function createTarget(entries, outputPath, outputFile) {
  let config = getCommonConfig();
  for (var i = 0; i < entries.length; i++)
    config.entry.push(entries[i]);
  config.output = {
    path: path.resolve(__dirname, outputPath),
    filename: outputFile
  }
  return config;
}

const virtualScrollerConfig = createTarget(['./library/index.js'], 'build', 'virtual-scroller.min.js');

module.exports = [virtualScrollerConfig];
