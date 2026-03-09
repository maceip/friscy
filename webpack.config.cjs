const path = require('path');

module.exports = {
  entry: './friscy-bundle/app.ts',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'friscy-bundle/dist'),
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: {
          loader: 'ts-loader',
          options: { transpileOnly: true },
        },
        exclude: /node_modules/,
      },
    ],
  },
};
