//@ts-check

'use strict';

const path = require('path');
const CopyPlugin = require('copy-webpack-plugin'); // 👈 **この行を追加**

//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

/** @type WebpackConfig */
const extensionConfig = {
  target: 'node',
  mode: 'none',

  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2'
  },
  externals: {
    vscode: 'commonjs vscode'
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  },
  devtool: 'nosources-source-map',
  infrastructureLogging: {
    level: "log",
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        // src/webview フォルダの中身を、ビルド後の dist/webview にコピーする設定
        { from: 'src/webview', to: 'webview' }
      ],
    }),
  ],
};
module.exports = [extensionConfig];