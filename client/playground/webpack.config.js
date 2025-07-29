const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  mode: 'development',
  entry: './main.ts',
  output: {
    filename: 'playground.bundle.js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
        include: [
          path.resolve(__dirname, './'),
          path.resolve(__dirname, '../styles/'),
        ],
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js', '.css'],
    alias: {
      '@': path.resolve(__dirname, '../'),
    },
  },
  devServer: {
    static: {
      directory: path.join(__dirname, 'dist'),
    },
    compress: true,
    port: 8082,
    hot: true,
    open: {
      app: {
         name: "google chrome",
      },
      target: ["/index.html"],
   },
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './main.html',
      filename: 'index.html',
    }),
  ],
  devtool: 'source-map',
}; 