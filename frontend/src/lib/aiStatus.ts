import type { AiStatus, Plan } from '@/lib/schemas/auth';

/** Why "Add from notes" can't run right now, or null when it can. */
export function notesLockMessage(ai: AiStatus, plan: Plan): string | null {
  if (ai.enabled && ai.remaining === 0) {
    return `You've used this month's ${ai.monthly_limit} extractions. More are available on the 1st, or upgrade to Pro. You can still add items by hand.`;
  }
  if (ai.enabled) return null;
  if (plan === 'free') {
    return 'Paste meeting notes, a WhatsApp chat or a voice note, and AI drafts the rows for you to check. It comes with Pro; ask your platform admin to turn it on. Adding items by hand stays free.';
  }
  return "AI isn't set up for your business yet. Ask your admin to add it. You can still add items by hand.";
}
