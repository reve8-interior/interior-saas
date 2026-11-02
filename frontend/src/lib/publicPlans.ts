import { API_URL } from '@/lib/config';
import type { PublicPlan } from '@/lib/schemas/plan';

const REVALIDATE_SECONDS = 300;

/** Server-side calls can use an in-network URL (e.g. inside Docker). */
const SERVER_API_URL = (process.env.API_INTERNAL_URL || API_URL).replace(
  /\/$/,
  ''
);

/** Plans for the landing page; an empty list when the API is unreachable. */
export async function getPublicPlans(): Promise<PublicPlan[]> {
  try {
    const response = await fetch(`${SERVER_API_URL}/plans`, {
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!response.ok) return [];
    return (await response.json()) as PublicPlan[];
  } catch {
    return [];
  }
}
