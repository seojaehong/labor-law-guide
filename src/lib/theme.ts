/** The root class is the shared source of truth for every responsive theme control.
 * It is initialized by layout.tsx before hydration, avoiding per-button state drift. */
export function getThemeSnapshot(): boolean {
  return document.documentElement.classList.contains('dark');
}

export function getServerThemeSnapshot(): boolean {
  return false;
}

export function subscribeToTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

export function toggleTheme(): void {
  const next = !getThemeSnapshot();
  document.documentElement.classList.toggle('dark', next);
  // Storage can be unavailable in privacy-restricted sessions. The live toggle still works.
  try {
    localStorage.setItem('theme', next ? 'dark' : 'light');
  } catch { /* Keep the in-session selection. */ }
}
