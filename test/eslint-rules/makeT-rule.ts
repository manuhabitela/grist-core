import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const repoRoot = process.cwd();
const plugin = path.join(repoRoot, "eslint-rules/local-rules.js");

function lint(filename: string, code: string, fix: boolean): { status: number | null, stdout: string, file: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "maket-"));
  const file = path.join(dir, filename);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, code);
  fs.writeFileSync(path.join(dir, ".oxlintrc.json"), JSON.stringify({
    jsPlugins: [{ name: "local", specifier: plugin }],
    rules: { "local/makeT-filename": "error" },
    categories: { correctness: "off" },
  }));
  const args = ["oxlint", "--config", path.join(dir, ".oxlintrc.json"), file];
  if (fix) { args.splice(1, 0, "--fix"); }
  const result = spawnSync(path.join(repoRoot, "node_modules/.bin/oxlint"), args.slice(1), {
    encoding: "utf8",
  });
  return {
    status: result.status,
    stdout: `${result.stdout ?? ""}${result.stderr ?? ""}`,
    file,
  };
}

function assert(condition: boolean, message: string) {
  if (!condition) { throw new Error(message); }
}

const valid = lint("app/client/ui/App.ts", `const t = makeT("App");\n`, false);
assert(valid.status === 0, `expected a matching makeT() call to pass:\n${valid.stdout}`);

const otherName = lint(
  "app/client/ui/Foo.ts",
  `const t = makeT("Foo"); const appT = makeT("App");\n`,
  false,
);
assert(otherName.status === 0, `expected makeT() assigned to a name other than t to pass:\n${otherName.stdout}`);

const invalid = lint("app/client/ui/App.ts", `const t = makeT("Foo");\n`, true);
assert(invalid.status === 0, `expected --fix to correct a mismatched makeT() call:\n${invalid.stdout}`);
assert(
  fs.readFileSync(invalid.file, "utf8").includes(`makeT("App")`),
  `expected the fixer to write makeT("App"), got:\n${fs.readFileSync(invalid.file, "utf8")}`,
);

console.info("✅ makeT-rule: All tests passed!");
