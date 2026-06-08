import { ClientScope } from "app/client/components/ClientScope";
import { Clipboard } from "app/client/components/Clipboard";
import { Comm } from "app/client/components/Comm";
import * as commandList from "app/client/components/commandList";
import * as commands from "app/client/components/commands";
import { KeyboardFocusHighlighter } from "app/client/components/KeyboardFocusHighlighter";
import { RegionFocusSwitcher } from "app/client/components/RegionFocusSwitcher";
import { unsavedChanges } from "app/client/components/UnsavedChanges";
import { get as getBrowserGlobals } from "app/client/lib/browserGlobals";
import { isDesktop } from "app/client/lib/browserInfo";
import { onClickOutside } from "app/client/lib/domUtils";
import { FocusLayer } from "app/client/lib/FocusLayer";
import { lockFocusUntilRemoved } from "app/client/lib/focusUtils";
import * as koUtil from "app/client/lib/koUtil";
import { makeT } from "app/client/lib/localization";
import { reportError, TopAppModel, TopAppModelImpl } from "app/client/models/AppModel";
import { DocPageModel } from "app/client/models/DocPageModel";
import { setUpErrorHandling } from "app/client/models/errors";
import { createAppUI } from "app/client/ui/AppUI";
import { openAccessibilityModal } from "app/client/ui/OpenAccessibilityModal";
import { addViewportTag } from "app/client/ui/viewport";
import { attachCssRootVars } from "app/client/ui2018/cssVars";
import { icon } from "app/client/ui2018/icons";
import { attachTheme } from "app/client/ui2018/theme";
import { visuallyHidden } from "app/client/ui2018/visuallyHidden";
import { BaseAPI } from "app/common/BaseAPI";
import { CommDocError } from "app/common/CommTypes";
import { DisposableWithEvents } from "app/common/DisposableWithEvents";
import { fetchFromHome } from "app/common/urlUtils";
import { ISupportedFeatures } from "app/common/UserConfig";

import { dom, MultiHolder } from "grainjs";
import * as ko from "knockout";

const t = makeT("App");

const G = getBrowserGlobals("document", "window");

export interface App extends DisposableWithEvents {
  allCommands: typeof commands.allCommands;
  comm: Comm;
  clientScope: ClientScope;
  features: ko.Computed<ISupportedFeatures>;
  topAppModel: TopAppModel;
  pageModel?: DocPageModel;
  regionFocusSwitcher?: RegionFocusSwitcher;
}

/**
 * Main Grist App UI component.
 */
export class AppImpl extends DisposableWithEvents implements App {
  // Used by #newui code to avoid a dependency on commands.js, and by tests to issue commands.
  public allCommands = commands.allCommands;

  public comm = this.autoDispose(Comm.create(this._checkError.bind(this)));
  public clientScope: ClientScope;
  public features: ko.Computed<ISupportedFeatures>;
  public topAppModel: TopAppModel;    // Exposed because used by test/nbrowser/gristUtils.

  // Track the most recently created DocPageModel, for some error handling.
  public pageModel?: DocPageModel;

  // Track the RegionFocusSwitcher created by pagePanels, so that the codebase can access it.
  public regionFocusSwitcher?: RegionFocusSwitcher;

  private _settings: ko.Observable<{ features?: ISupportedFeatures }>;

  // Track the version of the server we are communicating with, so that if it changes
  // we can choose to refresh the client also.
  private _serverVersion: string | null = null;

  constructor() {
    super();

    commands.init(); // Initialize the 'commands' module using the default command list.

    // Create the notifications box, and use it for reporting errors we can catch.
    setUpErrorHandling(reportError, koUtil);

    this.clientScope = this.autoDispose(ClientScope.create());

    // Settings, initialized by initSettings event triggered by a server message.
    this._settings = ko.observable({});
    this.features = ko.computed(() => this._settings().features || {});

    KeyboardFocusHighlighter.create(this);

    if (isDesktop()) {
      Clipboard.create(this, this);
    } else {
      // On mobile, we do not want to keep focus on a special textarea (which would cause unwanted
      // scrolling and showing of mobile keyboard). But we still rely on 'clipboard_focus' and
      // 'clipboard_blur' events to know when the "app" has a focus (rather than a particular
      // input), by making document.body focusable and using a FocusLayer with it as the default.
      document.body.setAttribute("tabindex", "-1");
      FocusLayer.create(this, {
        defaultFocusElem: document.body,
        allowFocus: Clipboard.allowFocus,
        onDefaultFocus: () => this.trigger("clipboard_focus"),
        onDefaultBlur: () => this.trigger("clipboard_blur"),
      });
    }

    this.topAppModel = this.autoDispose(TopAppModelImpl.create(null, G.window));

    const isHelpPaneVisible = ko.observable(false);
    const closeHelpPane = () => isHelpPaneVisible(false);
    let helpFocusOwner: MultiHolder | null = null;

    G.document.querySelector("#grist-logo-wrapper")?.remove();

    const helpDiv = document.body.appendChild(
      dom("div.g-help",
        {
          "role": "dialog",
          "aria-modal": "true",
          "aria-label": t("Keyboard shortcuts list"),
        },
        onClickOutside(closeHelpPane),
        dom.onKeyDown({
          Escape: () => closeHelpPane(),
        }),
        dom.show(isHelpPaneVisible), // Toggle visibility dynamically
        dom("button.g-help-close",
          icon("CrossBig"),
          dom.on("click", closeHelpPane),
          { "type": "button", "aria-label": t("Close") },
        ),
        dom("table.g-help-table.g-help-table-header",
          { "aria-hidden": "true" },
          dom("colgroup",
            dom("col.g-help-col-key"),
            dom("col.g-help-col-desc"),
          ),
          dom("thead",
            dom("tr",
              dom("th", t("Key")),
              dom("th", t("Description")),
            ),
          ),
        ),
        dom.forEach(commandList.groups, (group) => {
          const cmds = group.commands.filter(cmd => Boolean(cmd.desc && cmd.keys.length && !cmd.deprecated));
          return cmds.length > 0 ?
            dom("table.g-help-table",
              dom("colgroup",
                dom("col.g-help-col-key"),
                dom("col.g-help-col-desc"),
              ),
              dom("caption", group.group),
              dom("thead", dom.cls(visuallyHidden.className),
                dom("tr",
                  dom("th", { scope: "col" }, t("Key")),
                  dom("th", { scope: "col" }, t("Description")),
                ),
              ),
              dom("tbody",
                dom.forEach(cmds, cmd =>
                  dom("tr",
                    dom("td.g-help-key", commands.allCommands[cmd.name].getKeysDom()),
                    dom("td.g-help-desc", cmd.desc?.() ?? ""),
                  ),
                ),
              ),
            ) : null;
        }),
        (elem) => {
          this.autoDispose(isHelpPaneVisible.subscribe((visible) => {
            helpFocusOwner?.dispose();
            helpFocusOwner = null;
            if (visible) {
              helpFocusOwner = MultiHolder.create(null);
              lockFocusUntilRemoved(helpFocusOwner)(elem);
            }
          }));
        },
      ),
    );
    this.onDispose(() => {
      helpFocusOwner?.dispose();
      dom.domDispose(helpDiv);
      helpDiv.remove();
    });

    this.autoDispose(commands.createGroup({
      shortcuts() { isHelpPaneVisible(true); },
      accessibility() { openAccessibilityModal(this.topAppModel.appObs); },
      toggleScreenReaderMode() {
        const appModel = this.topAppModel.appObs.get();
        if (appModel) {
          appModel.screenReaderMode.set(!appModel.screenReaderMode.get());
          appModel.notifier.createUserMessage(
            appModel.screenReaderMode.get() ?
              t("Enabled screen reader improvements") : t("Disabled screen reader improvements"),
            {
              level: "success",
              key: "sr-mode-change",
            },
          );
        }
      },
      historyBack() { G.window.history.back(); },
      historyForward() { G.window.history.forward(); },
    }, this, true));

    this.autoDispose(commands.createGroup({
      shortcuts() { isHelpPaneVisible(false); },  // Close menu
    }, this, isHelpPaneVisible));

    this.listenTo(this.comm, "clientConnect", (message) => {
      console.log(`App clientConnect event: needReload ${message.needReload} version ${message.serverVersion}`);
      this._settings(message.settings);
      if (message.serverVersion === "dead" || (this._serverVersion && this._serverVersion !== message.serverVersion)) {
        console.log("Upgrading...");
        // Server has upgraded.  Upgrade client.  TODO: be gentle and polite.
        return this.reload();
      }
      this._serverVersion = message.serverVersion;
      // Reload any open documents if needed (if clientId changed, or client can't get all missed
      // messages). We'll simply reload the active component of the App regardless of what it is.
      if (message.needReload) {
        this._reloadPane();
      }
    });

    this.listenTo(this.comm, "connectState", (isConnected: boolean) => {
      this.topAppModel.notifier.setConnectState(isConnected);
    });

    this.listenTo(this.comm, "docShutdown", () => {
      console.log("Received docShutdown");
      // Reload on next tick, to let other objects process 'docShutdown' before they get disposed.
      setTimeout(() => this._reloadPane(), 0);
    });

    this.listenTo(this.comm, "docError", (msg: CommDocError) => {
      this._checkError(new Error(msg.data.message));
    });

    // When the document is unloaded, dispose the app, allowing it to do any needed
    // cleanup (e.g. Document on disposal triggers closeDoc message to the server). It needs to be
    // in 'beforeunload' rather than 'unload', since websocket is closed by the time of 'unload'.
    G.window.addEventListener("beforeunload", (ev: BeforeUnloadEvent) => {
      if (unsavedChanges.haveUnsavedChanges()) {
        // Following https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event
        ev.returnValue = true;
        ev.preventDefault();
        return true;
      }
      this.dispose();
    });

    this.comm.initialize(null);

    // Add the cssRootVars class to enable the variables in cssVars.
    attachCssRootVars(this.topAppModel.productFlavor);
    attachTheme();
    addViewportTag();
    this.autoDispose(createAppUI(this.topAppModel, this));
  }

  // We want to test errors from Selenium, but errors we can trigger using driver.executeScript()
  // will be impossible for the application to report properly (they seem to be considered not of
  // "same-origin"). So this silly callback is for tests to generate a fake error.
  public testTriggerError(msg: string) { throw new Error(msg); }

  // Intended to be used by tests to enable specific features.
  public testEnableFeature(featureName: keyof ISupportedFeatures, onOff: boolean) {
    const features = this.features();
    features[featureName] = onOff;
    this._settings(Object.assign(this._settings(), { features }));
  }

  public getServerVersion() {
    return this._serverVersion;
  }

  public reload() {
    G.window.location.reload(true);
    return true;
  }

  /**
   * This method is not called anywhere, it is here just to introduce
   * a special translation key. The purpose of this key is to let translators
   * control whether a translation is ready to be offered to the user.
   *
   * If the key has not been translated for a language, and the language
   * is not the default language, then the language should not be offered
   * or used (unless some flag is set). TODO: implement this once key
   * is available in weblate and good translations have been updated.
   */
  public checkSpecialTranslationKey() {
    return t("Translators: please translate this only when your language is ready to be offered to users");
  }

  // Get the user profile for testing purposes
  public async testGetProfile(): Promise<any> {
    const resp = await fetchFromHome("/api/profile/user", { credentials: "include" });
    return resp.json();
  }

  public testNumPendingApiRequests(): number {
    return BaseAPI.numPendingRequests();
  }

  private _reloadPane() {
    console.log("reloadPane");
    this.topAppModel.reload();
  }

  private _checkError(err: Error) {
    const message = String(err);
    // Take special action on any error that suggests a memory problem.
    if (message.match(/MemoryError|unmarshallable object/)) {
      if (err.message.length > 30) {
        // TLDR
        err.message = t("Memory Error");
      }
      this.pageModel?.offerRecovery(err);
    }
  }
}
