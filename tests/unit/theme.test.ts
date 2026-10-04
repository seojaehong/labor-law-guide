import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getThemeSnapshot, getServerThemeSnapshot, subscribeToTheme, toggleTheme } from '../../src/lib/theme';

describe('shared responsive theme controls', () => {
  let dark: boolean;
  let callbacks: Set<() => void>;
  const setItem = vi.fn();
  beforeEach(() => {
    dark = false;
    callbacks = new Set();
    setItem.mockReset();
    vi.stubGlobal('document', { documentElement: { classList: {
      contains: () => dark,
      toggle: (_name: string, next: boolean) => { dark = next; callbacks.forEach(fn => fn()); },
    } } });
    vi.stubGlobal('localStorage', { setItem });
    vi.stubGlobal('MutationObserver', class {
      constructor(private callback: () => void) {}
      observe() { callbacks.add(this.callback); }
      disconnect() { callbacks.delete(this.callback); }
    });
  });
  afterEach(() => vi.unstubAllGlobals());
  it('notifies both desktop and mobile controls from the same live theme', () => {
    const desktop = vi.fn(() => getThemeSnapshot());
    const mobile = vi.fn(() => getThemeSnapshot());
    const unsubscribeDesktop = subscribeToTheme(desktop);
    const unsubscribeMobile = subscribeToTheme(mobile);
    toggleTheme();
    expect(desktop).toHaveLastReturnedWith(true);
    expect(mobile).toHaveLastReturnedWith(true);
    // A newly visible control reads the document state; its first click reverses it.
    expect(getThemeSnapshot()).toBe(true);
    toggleTheme();
    expect(desktop).toHaveLastReturnedWith(false);
    expect(mobile).toHaveLastReturnedWith(false);
    expect(setItem).toHaveBeenLastCalledWith('theme', 'light');
    unsubscribeDesktop(); unsubscribeMobile();
    expect(callbacks.size).toBe(0);
  });
  it('respects an existing dark root on hydration and keeps SSR deterministic', () => {
    dark = true;
    expect(getThemeSnapshot()).toBe(true);
    expect(getServerThemeSnapshot()).toBe(false);
    toggleTheme();
    expect(getThemeSnapshot()).toBe(false);
  });
  it('still toggles when browser storage is unavailable', () => {
    setItem.mockImplementation(() => { throw new Error('Storage unavailable'); });
    expect(() => toggleTheme()).not.toThrow();
    expect(getThemeSnapshot()).toBe(true);
  });
});
