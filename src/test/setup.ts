import "fake-indexeddb/auto";
import "@testing-library/jest-dom";

// jsdom kennt ResizeObserver nicht; recharts' ResponsiveContainer benötigt es,
// sobald ein vollständiges Seiten-Rendering (statt einer isolierten Komponente)
// getestet wird.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Test-Stub, kein vollständiger ResizeObserver-Typ nötig
(globalThis as any).ResizeObserver ??= ResizeObserverStub;

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null as ((this: MediaQueryList, ev: MediaQueryListEvent) => unknown) | null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
