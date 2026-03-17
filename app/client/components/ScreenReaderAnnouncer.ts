import { makeT } from "app/client/lib/localization";
import { Notifier } from "app/client/models/NotifyModel";
import { visuallyHidden } from "app/client/ui2018/visuallyHidden";

import { Disposable, dom } from "grainjs";

const t = makeT("ScreenReaderAnnouncer");

export class ScreenReaderAnnouncer extends Disposable {
  private readonly _container: HTMLDivElement;

  constructor() {
    super();
    this._container = visuallyHidden({
      "id": "screen-reader-announcer",
      "aria-live": "polite",
      "aria-atomic": "false",
    });
    document.body.appendChild(this._container);
    this.onDispose(() => {
      dom.domDispose(this._container);
      this._container.remove();
    });
  }

  public listenToNotifier(notifier: Notifier) {
    const { toasts } = notifier.getStateForUI();
    this.autoDispose(toasts.addListener((newToasts) => {
      for (const toast of newToasts) {
        const { title, message } = toast.options;
        this.announce(t("Notification: {{notification}}", { notification: `${title ? `${title} - ` : ""}${message}` }));
      }
    }));
  }

  /**
   * Announces the given things to screen reader users.
   */
  public announce(...announcements: (string)[]) {
    for (const announcement of announcements) {
      if (!announcement) {
        continue;
      }
      // We append things to have some sort of announcement queue, instead of replacing content directly,
      // in case we want to announce different things at seemingly the same time.
      this._container.appendChild(dom("span", announcement));
      // Make sure the DOM doesn't get too big
      while (this._container.children.length > 10) {
        this._container.removeChild(this._container.firstChild!);
      }
    }
  }
}
