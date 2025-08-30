const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = (env, argv) => {
   const isProduction = argv.mode === "production";

   return {
      entry: {
         main: "./main.ts",
         szenarios: "./szenarios/main.ts",
         admin: "./admin/main.ts",
      },
      output: {
         filename: isProduction ? "[name].[contenthash].js" : "[name].js",
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
            chunks: ["main"],
         }),
         new HtmlWebpackPlugin({
            template: "szenarios/main.html",
            filename: "Szenarios.html",
            inject: "head",
            scriptLoading: "blocking",
            chunks: ["szenarios"],
         }),
         new HtmlWebpackPlugin({
            template: "admin/main.html",
            filename: "admin.html",
            inject: "head",
            scriptLoading: "blocking",
            chunks: ["admin"],
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
      optimization: isProduction ? {} : {
         minimize: false,
         splitChunks: false,
         runtimeChunk: false,
         removeAvailableModules: false,
         removeEmptyChunks: false,
         mergeDuplicateChunks: false,
         flagIncludedChunks: false,
         usedExports: false,
         concatenateModules: false,
         innerGraph: false,
         mangleExports: false,
         moduleIds: 'named',
         chunkIds: 'named',
      },
      mode: isProduction ? "production" : "development",
      devtool: isProduction ? "source-map" : "eval-source-map",
   };
};
