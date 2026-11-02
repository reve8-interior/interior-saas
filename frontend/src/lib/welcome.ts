const seenKey = (userId: string) => `welcome-seen:${userId}`;

/** Whether this user already answered the welcome prompt; storage can throw. */
export function loadWelcomeSeen(userId: string): boolean {
  try {
    return window.localStorage.getItem(seenKey(userId)) === '1';
  } catch {
    return false;
  }
}

/** Remember the answer, ignoring storage failures. */
export function saveWelcomeSeen(userId: string): void {
  try {
    window.localStorage.setItem(seenKey(userId), '1');
  } catch {
    // Without storage the prompt may return next visit; nothing breaks.
  }
}

/** Offer the sample only on the dashboard, to an account with no clients yet. */
export function shouldShowWelcome(
  pathname: string,
  clientCount: number | undefined,
  seen: boolean
): boolean {
  return !seen && pathname === '/dashboard' && clientCount === 0;
}
