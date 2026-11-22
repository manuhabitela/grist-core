import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// Extra lookup paths used when this repo is embedded (grist-static, Docker, Electron).
// WEBPACK_EXTRA_MODULE_PATHS is still accepted so existing callers keep working.
export function extraModulePaths() {
  const env = process.env.ROLLDOWN_EXTRA_MODULE_PATHS ?? process.env.WEBPACK_EXTRA_MODULE_PATHS;
  const paths = (env ?? "").split(path.delimiter).filter(Boolean);
  if (env === undefined && fs.existsSync("ext")) {
    console.warn("Including ./ext/node_modules and ../node_modules because ext is present");
    paths.push(path.resolve("ext/node_modules"));
    paths.push(path.resolve("../node_modules"));
  }
  return paths;
}

export function moduleRoots(extra = extraModulePaths()) {
  return [
    path.resolve("."),
    path.resolve("ext"),
    path.resolve("stubs"),
    ...extra,
  ];
}

function packageRoot(name, paths) {
  return path.dirname(require.resolve(`${name}/package.json`, { paths }));
}

export function resolveAliases(extra = extraModulePaths()) {
  const grainjsRoot = path.dirname(path.dirname(require.resolve("grainjs/package.json")));
  const aliases = {
    path: require.resolve("path-browserify"),
    process: require.resolve("process/browser"),
  };
  // React and its renderer must share one installation, including copies pulled in by ext/.
  for (const name of ["react", "react-dom"]) {
    aliases[name] = packageRoot(name, [
      ...extra.filter((dir) => fs.existsSync(path.join(dir, name, "package.json"))),
      path.resolve("ext"),
      grainjsRoot,
    ]);
  }
  return aliases;
}

// Webpack resolved bare imports like "app/client/..." from the repo root, ext/, and stubs/
// before node_modules. Rolldown's resolver does not have that search list.
export function gristResolvePlugin(roots = moduleRoots()) {
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

// moment-locales-webpack-plugin kept the default English locale and dropped the rest.
export function momentLocalesPlugin() {
  return {
    name: "moment-locales",
    resolveId(source) {
      const normalized = source.replaceAll("\\", "/");
      if (!normalized.includes("moment/locale/") && !normalized.includes("moment/dist/locale/")) {
        return null;
      }
      if (/(^|\/)en(\.js)?$/.test(normalized)) { return null; }
      return { id: "\0moment-locale-empty", moduleSideEffects: false };
    },
    load(id) {
      if (id === "\0moment-locale-empty") { return "export {};"; }
      return null;
    },
  };
}

// The test bundle expects jquery and jsdom to be globals, matching the old webpack externals.
export function browserExternalsPlugin() {
  return {
    name: "browser-externals",
    resolveId(source) {
      if (source === "jquery") { return "\0external:jquery"; }
      if (source === "jsdom") { return "\0external:jsdom"; }
      return null;
    },
    load(id) {
      if (id === "\0external:jquery") {
        return "module.exports = typeof window !== 'undefined' ? window.jQuery : undefined;";
      }
      if (id === "\0external:jsdom") {
        return "module.exports = typeof window !== 'undefined' ? window.alert : undefined;";
      }
      return null;
    },
  };
}

export function bundleTransform() {
  const nodeEnv = process.env.NODE_ENV === "production" ? "production" : "development";
  return {
    target: "es2020",
    jsx: "react-jsx",
    // Match esbuild-loader: drop named imports that are only used as types.
    typescript: {
      onlyRemoveTypeImports: false,
    },
    define: {
      "process.env.NODE_ENV": JSON.stringify(nodeEnv),
    },
    inject: {
      process: [require.resolve("process/browser"), "*"],
      Buffer: ["buffer", "Buffer"],
    },
  };
}

export function shouldMinify() {
  return process.env.GRIST_BUNDLE_MINIFY === "1";
}

export function clientEntries() {
  const entries = {
    main: path.resolve("app/client/app.js"),
    errorPages: path.resolve("app/client/errorMain.ts"),
    apiconsole: path.resolve("app/client/apiconsole.ts"),
    billing: path.resolve("app/client/billingMain.ts"),
    form: path.resolve("app/client/formMain.ts"),
  };
  if (fs.existsSync("test/client-harness/client.js")) {
    entries.test = path.resolve("test/client-harness/client.js");
  }
  return entries;
}
