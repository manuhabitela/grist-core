import path from "path";
import { createRequire } from "module";

import type { StorybookConfig } from "@storybook/html-vite";
import type { Plugin } from "vite";
import { mergeConfig } from "vite";

const require = createRequire(import.meta.url);

/**
 * Resolve bare imports like `app/client/...` the same way Grist's bundlers do:
 * look under the repo root, then stubs/, before falling back to node_modules.
 */
function gristModuleRootsPlugin(roots: string[]): Plugin {
  return {
    name: "grist-module-roots",
    async resolveId(source, importer, options) {
      if (!source || source.startsWith("\0") || source.startsWith(".") || path.isAbsolute(source)) {
        return null;
      }
      if (source.startsWith("node:")) { return null; }
      for (const root of roots) {
        const resolved = await this.resolve(path.join(root, source), importer, {
          skipSelf: true,
          ...options,
        });
        if (resolved) { return resolved; }
      }
      return null;
    },
  };
}

const config: StorybookConfig = {
  stories: [
    "../storybook/**/*.stories.ts",
  ],
  framework: {
    name: "@storybook/html-vite",
    options: {},
  },
  addons: [
    "@storybook/addon-docs",
  ],

  async viteFinal(config, { configDir }) {
    // Application itself is bundled with Rolldown; Storybook uses Vite for faster HMR.
    // Derive the repo root from configDir so resolution stays correct regardless of cwd.
    const coreRoot = path.resolve(configDir, "..");
    return mergeConfig(config, {
      plugins: [
        gristModuleRootsPlugin([
          coreRoot,
          path.join(coreRoot, "stubs"),
        ]),
      ],
      resolve: {
        extensions: [".ts", ".js", ".tsx", ".jsx", ".mjs", ".json"],
        alias: {
          // Same browser polyfill Rolldown uses for Node's `path`.
          path: require.resolve("path-browserify"),
          // Vite prefers bowser's `module` (src/) which breaks named exports; use the browser build.
          bowser: require.resolve("bowser/es5.js"),
          // Absolute ESM entry (avoid CJS dist/, which has no named `dedent` for native ESM).
          "ts-dedent": path.join(
            path.dirname(require.resolve("ts-dedent")),
            "..",
            "esm",
            "index.js",
          ),
        },
      },
      // Match Grist's client target.
      esbuild: {
        target: "es2020",
      },
      // Vite's CommonJS plugin defaults to node_modules only; include local CJS under app/.
      build: {
        commonjsOptions: {
          include: [/node_modules/, /\/app\/.*\.js$/],
          transformMixedEsModules: true,
        },
      },
      optimizeDeps: {
        esbuildOptions: {
          target: "es2020",
        },
      },
    });
  },
};

export default config;
