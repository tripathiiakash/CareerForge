import { JSDOM } from 'jsdom';

/**
 * Initializes a full JSDOM environment attached to globalThis
 * for React 18 component testing with Node.js built-in test runner.
 */
export function initTestDom() {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    {
      url: 'http://localhost:3000',
      pretendToBeVisual: true,
    }
  );

  const { window } = dom;

  globalThis.window = window as unknown as Window & typeof globalThis;
  globalThis.document = window.document;

  Object.defineProperty(globalThis, 'navigator', {
    value: window.navigator,
    configurable: true,
    writable: true,
  });

  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Element = window.Element;
  globalThis.Node = window.Node;
  globalThis.DocumentFragment = window.DocumentFragment;
  globalThis.HTMLInputElement = window.HTMLInputElement;
  globalThis.HTMLButtonElement = window.HTMLButtonElement;
  globalThis.HTMLSelectElement = window.HTMLSelectElement;
  globalThis.HTMLTextAreaElement = window.HTMLTextAreaElement;
  globalThis.HTMLFormElement = window.HTMLFormElement;
  globalThis.HTMLAnchorElement = window.HTMLAnchorElement;
  globalThis.Event = window.Event;
  globalThis.CustomEvent = window.CustomEvent;
  globalThis.KeyboardEvent = window.KeyboardEvent;
  globalThis.MouseEvent = window.MouseEvent;
  globalThis.FocusEvent = window.FocusEvent;
  globalThis.MutationObserver = window.MutationObserver;
  globalThis.getComputedStyle = window.getComputedStyle.bind(window);

  // Animation frame mocks
  globalThis.requestAnimationFrame = (callback: FrameRequestCallback) =>
    setTimeout(callback, 0) as unknown as number;
  globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id);

  // matchMedia mock
  globalThis.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;

  // In-Memory localStorage mock
  const storageMap = new Map<string, string>();
  const mockStorage: Storage = {
    length: 0,
    clear: () => storageMap.clear(),
    getItem: (key: string) => storageMap.get(key) ?? null,
    key: (index: number) => Array.from(storageMap.keys())[index] ?? null,
    removeItem: (key: string) => storageMap.delete(key),
    setItem: (key: string, val: string) => storageMap.set(key, String(val)),
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockStorage,
    configurable: true,
    writable: true,
  });

  // Signal to React 18 that act() environment is active
  // @ts-ignore
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  return dom;
}

// Auto-initialize on import
initTestDom();
