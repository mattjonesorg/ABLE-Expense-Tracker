import '@testing-library/jest-dom/vitest';

// Mantine requires window.matchMedia which jsdom does not implement
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Mantine uses ResizeObserver for some components
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserverMock;

// Mantine Combobox uses scrollIntoView which jsdom does not implement
Element.prototype.scrollIntoView = function () {};
