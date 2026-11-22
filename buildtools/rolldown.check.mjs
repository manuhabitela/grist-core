import path from "node:path";

import { defineConfig } from "rolldown";

import { bundleTransform, shouldMinify } from "./bundle-options.mjs";

// Runs on old browsers, so this stays a classic script with no code splitting.
export default defineConfig({
  input: path.resolve("app/client/browserCheck.ts"),
  platform: "browser",
  resolve: {
    extensions: [".ts", ".js"],
  },
  transform: bundleTransform(),
  output: {
    file: path.resolve("static/browser-check.js"),
    format: "iife",
    sourcemap: true,
    minify: shouldMinify(),
  },
});
