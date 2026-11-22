/**
 * Serves the static fixture projects built by rolldown so browser tests can open them.
 *
 * Use in a mocha test like so:
 *
 *    import {driver, useServer} from 'mocha-webdriver';
 *    import {server} from 'test/fixtures/projects/webpack-test-server';
 *    describe(..., () => {
 *      useServer(server);
 *      ...
 *      it(..., () => {
 *        await driver.get(`${server.getHost()}/MyPage`);
 *      })
 *    });
 *
 * The server is forked so test code that patches promises or the filesystem cannot
 * slow down the bundler.
 */
import { exitPromise } from "app/server/lib/serverUtils";

import { ChildProcess, spawn } from "child_process";
import * as path from "path";

import { driver, IMochaContext, IMochaServer } from "mocha-webdriver";
import stripAnsi from "strip-ansi";

const port = process.env.PORT || "8900";

export class FixtureServer implements IMochaServer {
  private _serverUrl: string;
  private _server: ChildProcess;
  private _exitPromise: Promise<number | string>;
  private _buildComplete: Promise<boolean>;

  public async start(context: IMochaContext) {
    context.timeout(60000);
    logMessage("starting");

    this._server = spawn("node", [
      path.resolve("test/fixtures/projects/serve.mjs"),
    ], {
      stdio: ["inherit", "pipe", "inherit"],
    });
    this._exitPromise = exitPromise(this._server);

    this._buildComplete = new Promise((resolve, reject) => {
      let buffer = "";
      this._server.stdout!.on("data", (data) => {
        buffer += data.toString("utf8");
        const clean = stripAnsi(buffer);
        if (/compiled with errors/i.test(clean)) {
          reject(new Error("fixture build failed"));
        }
        if (/compiled successfully/i.test(clean)) {
          resolve(true);
        }
      });
    });

    this._serverUrl = `http://localhost:${port}`;

    this._exitPromise
      .then(() => (this._server.killed || logMessage("fixture server died unexpectedly")))
      .catch(() => undefined);
    await this.waitServerReady(15000);
    logMessage("fixture build finished");
  }

  /**
   * Wait for the first build to finish, for up to `ms` milliseconds.
   */
  public async waitServerReady(ms: number): Promise<void> {
    await driver.wait(() => Promise.race([
      this._buildComplete,
      this._exitPromise.then((code) => {
        throw new Error(`fixture server exited while waiting for it (exit status ${code})`);
      }),
    ]), ms);
  }

  public async stop() {
    logMessage("stopping");
    this._server.kill();
    await this._exitPromise;
  }

  public getHost(): string {
    return this._serverUrl;
  }
}

function logMessage(msg: string) {
  console.error("[fixture-server] " + msg);
}

export const server = new FixtureServer();
