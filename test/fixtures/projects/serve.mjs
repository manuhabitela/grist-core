/**
 * Build and serve the fixture projects with live rebuilds.
 *
 *    node test/fixtures/projects/serve.mjs
 *
 * Pages are at http://localhost:8900/<ProjectName>. Prints "compiled successfully"
 * once the first build is done so the mocha harness can wait on it.
 */
import fs from "node:fs";
import path from "node:path";

import express from "express";
import { watch } from "rolldown";

import config, { projectEntries, projectsPort } from "./rolldown.config.mjs";

const htmlTemplate = fs.readFileSync(path.resolve("test/fixtures/projects/template.html"), "utf8");
const app = express();

app.use(express.static(path.resolve("test/fixtures/projects")));
app.use(express.static(path.resolve("bower_components")));
app.use("/locales", express.static(path.resolve("assets/locales")));

app.get("/", (_req, res) => {
  const links = Object.keys(projectEntries)
    .map((name) => `<a href="${name}">${name}</a><br>\n`)
    .join("");
  res.type("html").send(links);
});

app.get(Object.keys(projectEntries).map((name) => `/${name}`), (req, res) => {
  const name = path.basename(req.path);
  res.type("html").send(htmlTemplate.replace("<NAME>", name));
});

const server = app.listen(projectsPort, () => {
  console.log(`fixture server http://localhost:${projectsPort}`);
});

let announced = false;
const watcher = await watch(config);
watcher.on("event", (event) => {
  if (event.code === "BUNDLE_END") {
    event.result?.close();
    if (!announced) {
      announced = true;
      console.log("compiled successfully");
    }
  } else if (event.code === "ERROR") {
    console.log("compiled with errors");
    console.error(event.error);
  }
});

function shutdown() {
  server.close();
  watcher.close();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
