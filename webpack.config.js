const path = require('path');

module.exports = {
  entry: './friscy-bundle/app.js',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'friscy-bundle/dist'),
  },
};
