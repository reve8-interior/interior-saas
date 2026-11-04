import type { AiStatus, Plan } from '@/lib/schemas/auth';

/** Why "Add with AI" can't run right now, or null when it can. */
export function notesLockMessage(ai: AiStatus, plan: Plan): string | null {
  if (ai.enabled && ai.remaining === 0) {
    return `You've used this month's ${ai.monthly_limit} AI credits. They renew on the 1st, or upgrade your plan for more. You can still add items by hand.`;
  }
  if (ai.enabled) return null;
  if (plan === 'free') {
    return 'Paste meeting notes, a WhatsApp chat or a voice note, and AI drafts the rows for you to check. Upgrade your plan for more credits, and ask your platform admin to turn it on. Adding items by hand stays free.';
  }
  return "AI isn't set up for your business yet. Ask your admin to add it. You can still add items by hand.";
}
