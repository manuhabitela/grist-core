import fs from "node:fs";
import path from "node:path";

import { defineConfig } from "rolldown";

import {
  browserExternalsPlugin,
  bundleTransform,
  gristResolvePlugin,
  resolveAliases,
} from "../../../buildtools/bundle-options.mjs";

const projectsDir = path.resolve("test/fixtures/projects");

export const projectEntries = {};
for (const file of fs.readdirSync(projectsDir)) {
  if (!file.endsWith(".js") && !file.endsWith(".ts")) { continue; }
  const name = file.slice(0, file.lastIndexOf("."));
  if (name.startsWith("webpack") || name.startsWith("rolldown") || name.startsWith("serve")) { continue; }
  projectEntries[name] = path.join(projectsDir, file);
}

export const projectsPort = parseInt(process.env.PORT || "8900", 10);

export default defineConfig({
  input: projectEntries,
  platform: "browser",
  shimMissingExports: true,
  resolve: {
    alias: resolveAliases(),
    extensions: [".ts", ".tsx", ".js"],
  },
  plugins: [
    gristResolvePlugin([
      path.resolve("."),
      path.resolve("stubs"),
      path.resolve("ext"),
    ]),
    browserExternalsPlugin(),
  ],
  transform: bundleTransform(),
  output: {
    dir: projectsDir,
    format: "esm",
    entryFileNames: "build/[name].bundle.js",
    chunkFileNames: "build/[name].chunk.js",
    sourcemap: true,
  },
});
