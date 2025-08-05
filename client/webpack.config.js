const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = (env, argv) => {
   const isProduction = argv.mode === "production";

   return {
      entry: "./main.ts", // relative to project root
      output: {
         filename: isProduction ? "bundle.[contenthash].js" : "bundle.js",
         path: path.resolve(__dirname, "dist"),
         publicPath: "/",
         clean: true, // clean dist folder on build
      },
      resolve: {
         extensions: [".ts", ".js"],
         alias: {
            "@core": path.resolve(__dirname, "core/"),
            "@sim": path.resolve(__dirname, "sim/"),
            "@canvas": path.resolve(__dirname, "canvas/"),
         },
      },
      module: {
         rules: [
            {
               test: /\.ts$/,
               use: "ts-loader",
               exclude: /node_modules/,
            },

            {
               test: /\.css$/,
               use: ["style-loader", "css-loader"],
            },
            {
               test: /\.(png|svg|jpg|jpeg|gif)$/i,
               type: "asset/resource",
            },
            {
               test: /\.(woff|woff2|eot|ttf|otf)$/i,
               type: "asset/resource",
            },
         ],
      },
      plugins: [
         new HtmlWebpackPlugin({
            template: "main.html",
            filename: "main.html",
            inject: "head",
            scriptLoading: "blocking",
         }),
      ],
      devServer: {
         static: {
            directory: path.join(__dirname, "dist"),
         },
         port: 9000,
         
         hot: true,
         compress: true,
      },
      mode: isProduction ? "production" : "development",
      devtool: isProduction ? "source-map" : "eval-source-map",
   };
};
