const KEY = 'sidebar-collapsed';

/** Read the saved sidebar state; storage can throw (private mode, SSR). */
export function loadSidebarCollapsed(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** Persist the sidebar state, ignoring storage failures. */
export function saveSidebarCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(KEY, collapsed ? '1' : '0');
  } catch {
    // Persistence is a nicety; the toggle still works without it.
  }
}
