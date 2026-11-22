import path from "node:path";

import { defineConfig } from "rolldown";

import {
  bundleTransform,
  gristResolvePlugin,
  resolveAliases,
} from "./bundle-options.mjs";

// Classic script (and importScripts) that assigns the plugin API to the global `grist`.
// Left unminified so widget-facing class names stay readable.
export default defineConfig({
  input: path.resolve("app/plugin/grist-plugin-api.ts"),
  platform: "browser",
  resolve: {
    alias: resolveAliases(),
    extensions: [".ts", ".js"],
  },
  plugins: [
    gristResolvePlugin(),
  ],
  transform: bundleTransform(),
  output: {
    file: path.resolve("static/grist-plugin-api.js"),
    format: "iife",
    name: "grist",
    exports: "named",
    sourcemap: true,
    minify: false,
  },
});
