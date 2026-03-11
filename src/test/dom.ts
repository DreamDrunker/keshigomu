import { JSDOM } from "jsdom";

const assignGlobal = <T,>(key: string, value: T) =>
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value,
    writable: true,
  });

export const installDom = () => {
  const dom = new JSDOM(
    "<!doctype html><html><head></head><body><div id='root'></div></body></html>",
    { url: "http://localhost/" },
  );
  const { window } = dom;

  assignGlobal("window", window);
  assignGlobal("document", window.document);
  assignGlobal("navigator", window.navigator);
  assignGlobal("Node", window.Node);
  assignGlobal("Element", window.Element);
  assignGlobal("HTMLElement", window.HTMLElement);
  assignGlobal("HTMLStyleElement", window.HTMLStyleElement);
  assignGlobal("Event", window.Event);
  assignGlobal("CustomEvent", window.CustomEvent);
  assignGlobal("MouseEvent", window.MouseEvent);
  assignGlobal("File", window.File);
  assignGlobal("getComputedStyle", window.getComputedStyle.bind(window));
  assignGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    setTimeout(() => callback(Date.now()), 16));
  assignGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));

  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  window.alert = () => undefined;
  window.HTMLElement.prototype.scrollIntoView = () => undefined;
  assignGlobal(
    "ResizeObserver",
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );

  return () => {
    dom.window.close();
  };
};
