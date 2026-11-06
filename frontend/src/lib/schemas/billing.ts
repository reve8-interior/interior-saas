export type BillingCycle = 'monthly' | 'yearly';

export interface BillingStatus {
  plan: string;
  plan_name: string;
  billing_cycle: BillingCycle | null;
  /** none | created | active | pending | halted | cancelled | completed */
  subscription_status: string;
  current_period_end: string | null;
  payments_enabled: boolean;
  first_month_offer_available: boolean;
  can_cancel: boolean;
  /** False while a payment would only stack days on a plan already paid for. */
  can_buy: boolean;
  /** When a paid-up yearly plan can be renewed; null for other blocks. */
  renewal_opens_at: string | null;
  /** A paid, unexpired plan that can be switched to another one. */
  can_change_plan: boolean;
  /** A switch waiting for the period to end. */
  pending_plan: string | null;
  pending_plan_name: string | null;
  pending_change_on: string | null;
}

export type ChangeDirection = 'upgrade' | 'downgrade' | 'resume' | 'keep';

/** What switching plans would do; shown before the customer confirms. */
export interface ChangeQuote {
  direction: ChangeDirection;
  effective: 'now' | 'period_end';
  effective_on: string | null;
  amount_due_inr: number;
  current_plan_name: string;
  target_plan_name: string;
  billing_cycle: BillingCycle;
  summary: string;
}

export interface ChangePlanResponse {
  mode: 'checkout' | 'scheduled';
  checkout: CheckoutResponse | null;
  message: string;
  status: BillingStatus;
}

/** Proof of payment. Not a GST tax invoice. */
export interface Receipt {
  id: string;
  receipt_number: string;
  razorpay_payment_id: string;
  paid_at: string;
  plan_name: string;
  billing_cycle: BillingCycle;
  amount_paise: number;
  currency: string;
  method: string | null;
  period_start: string | null;
  period_end: string | null;
  billed_to: string;
  issuer_name: string;
  issuer_address: string;
}

export interface CheckoutRequest {
  plan_slug: string;
  billing_cycle: BillingCycle;
}

export interface CheckoutResponse {
  kind: 'subscription' | 'order';
  razorpay_id: string;
  key_id: string;
  plan_name: string;
  billing_cycle: BillingCycle;
  amount_inr: number;
  first_month_offer: boolean;
}

/** What Razorpay Checkout hands back after a successful payment. */
export interface CheckoutResult {
  razorpay_payment_id: string;
  razorpay_signature: string;
  razorpay_subscription_id?: string;
  razorpay_order_id?: string;
}

export interface PlanSyncResult {
  razorpay_plan_id_monthly: string | null;
  created: boolean;
}
