import path from "node:path";

import { defineConfig } from "rolldown";

import {
  browserExternalsPlugin,
  bundleTransform,
  clientEntries,
  gristResolvePlugin,
  momentLocalesPlugin,
  resolveAliases,
  shouldMinify,
} from "./bundle-options.mjs";

// Browser bundles written to static/ and loaded as <script type="module">.
// The Node server is compiled separately by tsc.
export default defineConfig({
  input: clientEntries(),
  platform: "browser",
  // "use client" / similar directives from React RSC packages (e.g. @assistant-ui)
  // are meaningless in this browser SPA bundle; silence the noise.
  checks: {
    moduleLevelDirective: false,
  },
  resolve: {
    alias: resolveAliases(),
    extensions: [".ts", ".tsx", ".js"],
  },
  plugins: [
    gristResolvePlugin(),
    browserExternalsPlugin(),
    momentLocalesPlugin(),
  ],
  transform: bundleTransform(),
  // Keep prior build/start logs visible (tsc already uses --preserveWatchOutput).
  watch: {
    clearScreen: false,
  },
  output: {
    dir: path.resolve("static"),
    format: "esm",
    entryFileNames: "[name].bundle.js",
    chunkFileNames: "[name].bundle.js",
    sourcemap: true,
    minify: shouldMinify(),
    codeSplitting: true,
  },
});
