/**
 * Accessible name for a control, with an optional tooltip.
 *
 * The name is always the trigger's aria-label. When there is no `tooltipText`, when it is a
 * prefix of the name (including an exact match), or when `forceAriaHiddenTooltip` is set, the
 * tooltip is aria-hidden. Otherwise `tooltipText` is treated as a description: aria-describedby
 * points at it only while it is open.
 *
 * A cold hover waits 1.5s, or 0.5s when `instantTooltip` is set. Once any altText tooltip is open,
 * moving to another opens it immediately and without a fade. A tooltip that is still waiting does
 * not warm the others. Opening the next tooltip closes the previous one. After the pointer leaves
 * the trigger, the tooltip stays up for 0.5s so a warm move to another trigger can still work; it
 * does not stay open when the pointer is over the tip itself. Keyboard focus shows and hides the
 * tooltip immediately, with no fade. Tabbing from one of these controls to another swaps the same
 * way. Escape (whether the trigger is focused or only hovered), click, Enter, and Space dismiss
 * it until the pointer leaves and re-enters, or focus leaves and returns.
 */
import { type ITipOptions, type ITooltipContent, type ITooltipContentFunc,
  showTooltip } from "app/client/ui/tooltips";

import { BindableValue, ComputedCallback, dom, DomElementMethod, Observable, subscribeElem,
  UseCBOwner } from "grainjs";

export interface AltTextOptions {
  /** When false, set the accessible name and never open a tooltip. Defaults to true. */
  showTooltip?: boolean;
  /**
   * Text shown in the tooltip instead of the alt.
   *
   * A string, observable, or `(use) => string` stays in sync while the tooltip is open,
   * the same way as the accessible name. A DOM node is shown as-is.
   *
   * When this value is a prefix of the alt (e.g. alt "Close panel", tip "Close"), the tip is
   * aria-hidden. When it is not (e.g. tip "Click to hide"), aria-describedby points at it.
   */
  tooltipText?: BindableValue<string> | Exclude<ITooltipContent, ITooltipContentFunc>;
  /** Show the tooltip immediately on hover instead of waiting for a delay. Defaults to false. */
  instantTooltip?: boolean;
  /** Where to place the tooltip relative to the trigger. Defaults to "bottom". */
  tooltipPlacement?: ITipOptions["placement"];
  /**
   * When true, always set aria-hidden on the tooltip.
   * This is a sort of escape-hatch when you are sure the tooltip content should be ignored
   * by screen readers and the alt is sufficient, but the automatic internal system is wrong.
   * This can happen when using markup in the tooltip content.
   */
  forceAriaHiddenTooltip?: boolean;
}

const COLD_TOOLTIP_DELAY_MS = 1200;
const INSTANT_TOOLTIP_DELAY_MS = 200;
const TOOLTIP_CLOSE_DELAY_MS = 500;
const POPUP_OPEN_CLASS = "weasel-popup-open";

interface OpenAltTip {
  trigger: Element;
  dom: HTMLElement;
  close: () => void;
}

/** The one open altText tooltip. Its presence is the warm session. */
let openTip: OpenAltTip | null = null;
let nextTipId = 0;

export function altWithTooltip(text: BindableValue<string>, options: AltTextOptions = {}): DomElementMethod {
  const showTip = options.showTooltip !== false;
  const delayMs = options.instantTooltip ? INSTANT_TOOLTIP_DELAY_MS : COLD_TOOLTIP_DELAY_MS;
  const tooltipText = options.tooltipText;
  const tooltipPlacement = options.tooltipPlacement ?? "bottom";
  const forceAriaHiddenTooltip = options.forceAriaHiddenTooltip === true;

  return (elem) => {
    subscribeElem(elem, text, (value) => {
      elem.setAttribute("aria-label", value);
    });
    if (!showTip) { return; }

    let openTimer: ReturnType<typeof setTimeout> | undefined;
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    let pointerInside = false;
    let focusFromPointer = false;
    let keyboardFocused = false;
    // Dismissed while the pointer is still inside, or while keyboard focus remains.
    let blockHover = false;
    let blockFocus = false;

    function clearOpenTimer() {
      if (openTimer !== undefined) {
        clearTimeout(openTimer);
        openTimer = undefined;
      }
    }
    function clearCloseTimer() {
      if (closeTimer !== undefined) {
        clearTimeout(closeTimer);
        closeTimer = undefined;
      }
    }
    function isCurrentTip() {
      return openTip?.trigger === elem;
    }
    function popupOpen() {
      return elem.getAttribute("aria-expanded") === "true" ||
        Boolean(elem.closest(`.${POPUP_OPEN_CLASS}`));
    }
    function closeNow() {
      clearOpenTimer();
      clearCloseTimer();
      if (isCurrentTip()) {
        openTip!.close();
      }
    }
    function dismiss() {
      blockFocus = true;
      if (pointerInside) { blockHover = true; }
      closeNow();
    }
    function scheduleClose() {
      clearCloseTimer();
      if (!isCurrentTip()) { return; }
      closeTimer = setTimeout(() => {
        closeTimer = undefined;
        closeNow();
      }, TOOLTIP_CLOSE_DELAY_MS);
    }
    function open(fromKeyboard = false) {
      if (popupOpen() || isCurrentTip()) { return; }
      clearOpenTimer();
      clearCloseTimer();
      // Keep the current tip until the next one is opaque, so a warm swap does not fade.
      const previous = openTip;
      const snap = Boolean(previous) || fromKeyboard;

      let cleaned = false;
      const ctl = showTooltip(elem, () => renderTip(text, tooltipText), {
        placement: tooltipPlacement,
        skipFade: snap,
      });
      const tipDom = ctl.getDom();
      if (snap) {
        if (previous) { previous.dom.style.transition = "none"; }
        tipDom.style.transition = "none";
        tipDom.style.opacity = "1";
      }
      syncTipAria(elem, tipDom, text, tooltipText, forceAriaHiddenTooltip);
      // Tips are labels only: never capture the pointer, or a hover-revealed trigger can hide
      // while the tip keeps the close timer cancelled.
      tipDom.style.pointerEvents = "none";

      function finish() {
        if (cleaned) { return; }
        cleaned = true;
        clearCloseTimer();
        if (openTip?.trigger === elem) { openTip = null; }
        if (elem.getAttribute("aria-describedby") === tipDom.id) {
          elem.removeAttribute("aria-describedby");
        }
      }
      dom.onDisposeElem(tipDom, finish);

      // Escape must work while hovering even if the trigger is not focused: keydown
      // then lands on document.activeElement, not on this element. Capture so we
      // consume Escape before ancestors see it (same as the old trigger listener).
      const onEscape = dom.onElem(document, "keydown", (ev) => {
        if (ev.key !== "Escape" || !isCurrentTip()) { return; }
        ev.preventDefault();
        ev.stopPropagation();
        dismiss();
      }, { useCapture: true });
      dom.autoDisposeElem(tipDom, onEscape);

      openTip = { trigger: elem, dom: tipDom, close: () => ctl.close() };
      if (previous && previous.trigger !== elem) { previous.close(); }
    }
    function scheduleOpen() {
      if (blockHover || popupOpen()) { return; }
      if (isCurrentTip()) {
        clearCloseTimer();
        return;
      }
      clearOpenTimer();
      // An open tooltip (including one waiting out its close delay) warms every altText trigger.
      if (openTip) {
        open();
        return;
      }
      openTimer = setTimeout(() => {
        openTimer = undefined;
        open();
      }, delayMs);
    }

    dom.onElem(elem, "pointerenter", () => {
      pointerInside = true;
      scheduleOpen();
    });
    dom.onElem(elem, "pointerleave", () => {
      pointerInside = false;
      blockHover = false;
      clearOpenTimer();
      if (keyboardFocused) { return; }
      scheduleClose();
    });
    dom.onElem(elem, "pointerdown", () => {
      focusFromPointer = true;
    });
    dom.onElem(elem, "pointerup", () => {
      if (document.activeElement !== elem) { focusFromPointer = false; }
    });
    dom.onElem(elem, "focus", () => {
      const fromPointer = focusFromPointer;
      focusFromPointer = false;
      if (fromPointer) {
        keyboardFocused = false;
        return;
      }
      keyboardFocused = true;
      if (blockFocus || popupOpen()) { return; }
      clearOpenTimer();
      open(true);
    });
    dom.onElem(elem, "blur", () => {
      keyboardFocused = false;
      blockFocus = false;
      clearOpenTimer();
      if (!isCurrentTip()) { return; }
      // Tab blurs this control and focuses the next one before the next microtask.
      // Leave the tip up so that focus can replace it without a fade.
      queueMicrotask(() => {
        if (isCurrentTip()) { closeNow(); }
      });
    });
    dom.onElem(elem, "click", () => dismiss());
    // Escape is handled on document while the tip is open (see open()), so it also
    // works when the trigger is only hovered. Enter/Space still need focus.
    dom.onElem(elem, "keydown", (ev) => {
      if ((ev.key === "Enter" || ev.key === " ") && isCurrentTip()) {
        dismiss();
      }
    });

    // The menu class may land on this element or, for a split control, on its parent.
    // The parent is often not connected yet while this element is being built.
    const observer = new MutationObserver(() => {
      if (!popupOpen()) { return; }
      clearOpenTimer();
      if (isCurrentTip()) { closeNow(); }
    });
    const observed = new Set<Node>();
    const observe = (node: Node | null) => {
      if (!node || observed.has(node)) { return; }
      observed.add(node);
      observer.observe(node, { attributes: true, attributeFilter: ["class", "aria-expanded"] });
    };
    observe(elem);
    queueMicrotask(() => observe(elem.parentElement));
    dom.onDisposeElem(elem, () => {
      observer.disconnect();
      clearOpenTimer();
      clearCloseTimer();
      if (isCurrentTip()) { openTip!.close(); }
    });
  };
}

function renderTip(
  text: BindableValue<string>,
  tooltipText: BindableValue<string> | Exclude<ITooltipContent, ITooltipContentFunc> | undefined,
) {
  if (tooltipText === undefined) {
    return dom("span", dom.text(text));
  }
  if (isLiveText(tooltipText)) {
    return dom("span", dom.text(tooltipText));
  }
  return tooltipText;
}

function syncTipAria(
  trigger: Element,
  tipDom: HTMLElement,
  text: BindableValue<string>,
  tooltipText: BindableValue<string> | Exclude<ITooltipContent, ITooltipContentFunc> | undefined,
  forceAriaHiddenTooltip: boolean,
) {
  if (forceAriaHiddenTooltip || tooltipText === undefined) {
    tipDom.setAttribute("aria-hidden", "true");
    return;
  }
  if (!isLiveText(tooltipText)) {
    describeWithTip(trigger, tipDom);
    return;
  }
  // Hide when the tip is a prefix of the name; otherwise point aria-describedby at it.
  subscribeElem(tipDom, (use) => {
    const alt = readBindable(use, text);
    const tip = readBindable(use, tooltipText);
    return alt.startsWith(tip);
  }, (isPrefix) => {
    if (isPrefix) {
      tipDom.setAttribute("aria-hidden", "true");
      if (trigger.getAttribute("aria-describedby") === tipDom.id) {
        trigger.removeAttribute("aria-describedby");
      }
      return;
    }
    tipDom.removeAttribute("aria-hidden");
    describeWithTip(trigger, tipDom);
  });
}

function describeWithTip(trigger: Element, tipDom: HTMLElement) {
  if (!tipDom.id) {
    tipDom.id = `alt-text-tip-${++nextTipId}`;
  }
  trigger.setAttribute("aria-describedby", tipDom.id);
}

function readBindable(use: UseCBOwner, value: BindableValue<string>): string {
  if (typeof value === "function") {
    // Knockout observables are functions with peek; computed callbacks take use.
    const maybeKo = value as { peek?: () => string };
    if (typeof maybeKo.peek === "function") { return use(value as never); }
    return (value as ComputedCallback<string>)(use);
  }
  if (isObservable(value)) { return use(value) as string; }
  return value as string;
}

function isLiveText(
  value: BindableValue<string> | Exclude<ITooltipContent, ITooltipContentFunc>,
): value is BindableValue<string> {
  return typeof value === "string" || typeof value === "function" || isObservable(value);
}

function isObservable(value: unknown): value is Observable<unknown> {
  if (!value || typeof value !== "object") { return false; }
  const obs = value as Partial<Observable<unknown>>;
  return typeof obs.get === "function" && typeof obs.addListener === "function";
}
