import { altWithTooltip } from "app/client/ui/altText";
import { delay } from "app/common/delay";

import { assert } from "chai";
import { dom, Observable } from "grainjs";
import { popGlobals, pushGlobals } from "grainjs/dist/cjs/lib/browserGlobals";
import { JSDOM } from "jsdom";

let view!: JSDOM["window"];

describe("altText", function() {
  let restoreGlobals: () => void;

  beforeEach(function() {
    const installed = installJsdom();
    restoreGlobals = installed.restore;
    view = installed.view;
  });

  afterEach(function() {
    for (const el of [...document.body.children]) {
      dom.domDispose(el);
      el.remove();
    }
    restoreGlobals();
  });

  it("waits out the cold delay, then opens a name tooltip that is aria-hidden", async function() {
    this.timeout(5000);
    const button = attach(dom("button", altWithTooltip("Save")));
    assert.equal(button.getAttribute("aria-label"), "Save");

    enter(button);
    await delay(400);
    assert.equal(openTips().length, 0);

    await delay(1300);
    const tip = onlyTip();
    assert.equal(tip.textContent, "Save");
    assert.equal(tip.getAttribute("aria-hidden"), "true");
    assert.isNull(button.getAttribute("aria-describedby"));
    // The first tooltip keeps the fade. A warm swap turns it off.
    assert.notEqual(tip.style.transition, "none");
  });

  it("opens the next tooltip immediately, with no fade, once one is shown", async function() {
    this.timeout(5000);
    const quick = attach(dom("button", altWithTooltip("Quick", { instantTooltip: true })));
    const slow = attach(dom("button", altWithTooltip("Slow")));

    enter(quick);
    await delay(100);
    // Still waiting, so it does not warm the other trigger.
    enter(slow);
    await delay(50);
    assert.equal(openTips().length, 0);
    leave(slow);

    await delay(150);
    assert.equal(onlyTip().textContent, "Quick");

    enter(slow);
    const tip = onlyTip();
    assert.equal(tip.textContent, "Slow");
    assert.equal(tip.style.transition, "none");
    assert.equal(tip.style.opacity, "1");
  });

  it("shows a keyboard tooltip immediately, including after the previous one has closed", async function() {
    const first = attach(dom("button", altWithTooltip("First")));
    const second = attach(dom("button", altWithTooltip("Second")));

    first.focus();
    const cold = onlyTip();
    assert.equal(cold.textContent, "First");
    assert.equal(cold.style.transition, "none");
    assert.equal(cold.style.opacity, "1");

    second.focus();
    const tip = onlyTip();
    assert.equal(tip.textContent, "Second");
    assert.equal(tip.style.transition, "none");
    assert.equal(tip.style.opacity, "1");

    first.focus();
    first.blur();
    await Promise.resolve();
    assert.equal(openTips().length, 0);

    second.focus();
    const again = onlyTip();
    assert.equal(again.textContent, "Second");
    assert.equal(again.style.transition, "none");
    assert.equal(again.style.opacity, "1");
  });

  it("lets the first Escape dismiss the tooltip and leaves the next Escape alone", async function() {
    const wrap = dom("div",
      dom("button", altWithTooltip("Save")),
    );
    document.body.appendChild(wrap);
    const button = wrap.querySelector("button")!;
    const seen: KeyboardEvent[] = [];
    wrap.addEventListener("keydown", ev => seen.push(ev));

    button.focus();
    assert.equal(onlyTip().textContent, "Save");
    assert.equal(document.activeElement, button);

    const first = escapeKey();
    button.dispatchEvent(first);
    assert.isTrue(first.defaultPrevented);
    assert.equal(seen.length, 0);
    assert.equal(openTips().length, 0);
    assert.equal(document.activeElement, button);

    const second = escapeKey();
    button.dispatchEvent(second);
    assert.isFalse(second.defaultPrevented);
    assert.equal(seen.length, 1);
    assert.equal(openTips().length, 0);
  });

  it("dismisses a hover tooltip with Escape even when the trigger is not focused", async function() {
    this.timeout(5000);
    const button = attach(dom("button", altWithTooltip("Save", { instantTooltip: true })));
    const other = attach(dom("button", "Other"));
    other.focus();
    assert.equal(document.activeElement, other);

    enter(button);
    await delay(250);
    assert.equal(onlyTip().textContent, "Save");

    const first = escapeKey();
    // Keydown lands on the focused element, not the hovered trigger.
    other.dispatchEvent(first);
    assert.isTrue(first.defaultPrevented);
    assert.equal(openTips().length, 0);
    assert.equal(document.activeElement, other);

    // Still hovering: blocked until leave + re-enter.
    await delay(50);
    assert.equal(openTips().length, 0);

    const second = escapeKey();
    other.dispatchEvent(second);
    assert.isFalse(second.defaultPrevented);

    leave(button);
    enter(button);
    await delay(250);
    assert.equal(onlyTip().textContent, "Save");
  });

  it("never opens a tooltip when showTooltip is false", async function() {
    const button = attach(dom("button", altWithTooltip("Name", { showTooltip: false })));
    assert.equal(button.getAttribute("aria-label"), "Name");

    enter(button);
    button.focus();
    await delay(30);
    assert.equal(openTips().length, 0);
    assert.isNull(button.getAttribute("aria-describedby"));
  });

  it("keeps the name and the tooltip text in sync with their observables", function() {
    const panelOpen = Observable.create(null, false);
    const button = attach(dom("button", altWithTooltip(
      use => use(panelOpen) ? "Close navigation panel (left panel)" : "Open navigation panel (left panel)",
      { tooltipText: use => use(panelOpen) ? "Close navigation panel" : "Open navigation panel" },
    )));
    assert.equal(button.getAttribute("aria-label"), "Open navigation panel (left panel)");

    button.focus();
    const tip = onlyTip();
    assert.equal(tip.textContent, "Open navigation panel");
    // A tip that is a prefix of the name stays aria-hidden.
    assert.equal(tip.getAttribute("aria-hidden"), "true");
    assert.isNull(button.getAttribute("aria-describedby"));

    panelOpen.set(true);
    assert.equal(button.getAttribute("aria-label"), "Close navigation panel (left panel)");
    assert.equal(onlyTip().textContent, "Close navigation panel");
    assert.equal(onlyTip().getAttribute("aria-hidden"), "true");
    assert.isNull(button.getAttribute("aria-describedby"));
  });

  it("hides a tip that is a prefix of the name, and describes one that is not", async function() {
    const tipText = Observable.create(null, "Close");
    const button = attach(dom("button", altWithTooltip("Close panel", { tooltipText: tipText })));

    button.focus();
    assert.equal(onlyTip().textContent, "Close");
    assert.equal(onlyTip().getAttribute("aria-hidden"), "true");
    assert.isNull(button.getAttribute("aria-describedby"));

    tipText.set("Close panel");
    assert.equal(onlyTip().getAttribute("aria-hidden"), "true");
    assert.isNull(button.getAttribute("aria-describedby"));

    tipText.set("panel");
    assert.notEqual(onlyTip().getAttribute("aria-hidden"), "true");
    assert.equal(button.getAttribute("aria-describedby"), onlyTip().id);

    tipText.set("Click to hide");
    assert.equal(onlyTip().textContent, "Click to hide");
    assert.equal(button.getAttribute("aria-describedby"), onlyTip().id);

    tipText.set("Close panel and continue");
    assert.equal(button.getAttribute("aria-describedby"), onlyTip().id);

    tipText.set("Close");
    assert.equal(onlyTip().getAttribute("aria-hidden"), "true");
    assert.isNull(button.getAttribute("aria-describedby"));

    button.blur();
    await Promise.resolve();
    assert.equal(openTips().length, 0);
    assert.isNull(button.getAttribute("aria-describedby"));
  });

  it("closes after the pointer leaves the trigger, and the tip does not capture the pointer", async function() {
    this.timeout(5000);
    const button = attach(dom("button", altWithTooltip("Save", { instantTooltip: true })));
    enter(button);
    await delay(250);
    const tip = onlyTip();
    assert.equal(tip.style.pointerEvents, "none");

    leave(button);
    await delay(100);
    assert.equal(onlyTip().textContent, "Save");
    await delay(450);
    assert.equal(openTips().length, 0);
  });

  it("points aria-describedby at a divergent tooltip only while it is open", async function() {
    const button = attach(dom("button", altWithTooltip("Name", { tooltipText: "Extra detail" })));
    assert.equal(button.getAttribute("aria-label"), "Name");
    assert.isNull(button.getAttribute("aria-describedby"));

    button.focus();
    const id = button.getAttribute("aria-describedby");
    const tip = onlyTip();
    assert.isOk(id);
    assert.equal(tip.id, id);
    assert.equal(tip.textContent, "Extra detail");
    assert.notEqual(tip.getAttribute("aria-hidden"), "true");

    button.blur();
    await Promise.resolve();
    assert.equal(openTips().length, 0);
    assert.isNull(button.getAttribute("aria-describedby"));
  });
});

function attach(button: HTMLButtonElement): HTMLButtonElement {
  document.body.appendChild(button);
  return button;
}

function enter(elem: Element) {
  elem.dispatchEvent(new view.Event("pointerenter"));
}

function leave(elem: Element) {
  elem.dispatchEvent(new view.Event("pointerleave"));
}

function escapeKey() {
  return new view.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
}

function openTips(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(".test-tooltip")];
}

function onlyTip(): HTMLElement {
  const tips = openTips();
  assert.equal(tips.length, 1);
  return tips[0];
}

function installJsdom() {
  const jsdomDoc = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
  const win = jsdomDoc.window;
  pushGlobals(win);
  const names = [
    "window", "document", "HTMLElement", "Element", "Node", "SVGElement", "MutationObserver",
    "KeyboardEvent", "PointerEvent", "MouseEvent", "getComputedStyle",
    "requestAnimationFrame", "cancelAnimationFrame",
  ];
  const previous = new Map<string, unknown>();
  for (const name of names) {
    const prior = assignGlobal(name, (win as any)[name]);
    if (prior) { previous.set(name, prior.value); }
  }

  return {
    view: win,
    restore: () => {
      for (const [name, value] of previous) {
        assignGlobal(name, value);
      }
      popGlobals();
      win.close();
    },
  };
}

function assignGlobal(name: string, value: unknown): { value: unknown } | null {
  const desc = Object.getOwnPropertyDescriptor(global, name);
  if (desc?.writable === false && !desc.set) { return null; }
  const prior = (global as any)[name];
  try {
    (global as any)[name] = value;
  } catch {
    return null;
  }
  return { value: prior };
}
