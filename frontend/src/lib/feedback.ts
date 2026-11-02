import { api } from '@/lib/api';
import {
  AdminFeedback,
  FeedbackAnswer,
  FeedbackPrompt,
} from '@/lib/schemas/feedback';

/** A user is asked at most once in this window, whether they answered or not. */
export const PROMPT_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;
/** The popup appears after a random pause in this range, so it never lands on page load. */
export const PROMPT_DELAY_RANGE_MS: readonly [number, number] = [
  20_000, 60_000,
];

const keyFor = (userId: string) => `feedback-shown:${userId}`;

/** True when this user has not been prompted within the cooldown. */
export function isDueForPrompt(
  lastShown: number | null,
  now: number = Date.now()
): boolean {
  return lastShown === null || now - lastShown >= PROMPT_COOLDOWN_MS;
}

/** A random pause between the range bounds; `random` is injectable for tests. */
export function randomDelay(random: () => number = Math.random): number {
  const [min, max] = PROMPT_DELAY_RANGE_MS;
  return Math.round(min + random() * (max - min));
}

/** When this user was last prompted; storage can throw (private mode, SSR). */
export function loadLastShown(userId: string): number | null {
  try {
    const raw = window.localStorage.getItem(keyFor(userId));
    const parsed = raw === null ? NaN : Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Remember that this user was prompted, ignoring storage failures. */
export function saveLastShown(userId: string, at: number = Date.now()): void {
  try {
    window.localStorage.setItem(keyFor(userId), String(at));
  } catch {
    // Without storage the cooldown only lasts for this tab; nothing breaks.
  }
}

export function getNextPrompt(): Promise<FeedbackPrompt | null> {
  return api.get<FeedbackPrompt | null>('/feedback/next');
}

export function submitFeedback(answer: FeedbackAnswer): Promise<unknown> {
  return api.post('/feedback', answer);
}

export function getAdminFeedback(): Promise<AdminFeedback> {
  return api.get<AdminFeedback>('/admin/feedback');
}
