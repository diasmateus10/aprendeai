// Free vs Premium, shared by the app (what to show and lock) and the server (what to allow and charge).

export type PlanId = "monthly" | "yearly";

export interface PlanInfo {
  id: PlanId;
  label: string;
  /** Price in cents of BRL, as charged by Stripe. */
  amount: number;
  interval: "month" | "year";
  /** Stripe Price lookup key, created by scripts/stripe-setup.mjs. */
  lookupKey: string;
}

export const PLANS: PlanInfo[] = [
  { id: "monthly", label: "Mensal", amount: 1990, interval: "month", lookupKey: "aprendeai_premium_monthly" },
  { id: "yearly", label: "Anual", amount: 14900, interval: "year", lookupKey: "aprendeai_premium_yearly" },
];

export const TRIAL_DAYS = 7;

/** Free plan: the first unit of the course, one AI conversation a day and a taste of the Kids rhymes. */
export const FREE_UNITS = 1;
export const FREE_CHATS_PER_DAY = 1;
/** Premium talk time with the AI per day, in minutes of active conversation. */
export const PREMIUM_CHAT_MINUTES = 30;
export const FREE_RHYMES = 2;

/** Stripe statuses that keep Premium on (past_due: Stripe is still retrying the card). */
export const PREMIUM_STATUSES = ["trialing", "active", "past_due"];

export const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

/** "R$ 12,42" a month for the yearly plan, to show the saving. */
export const monthlyEquivalent = (plan: PlanInfo) => brl(Math.round(plan.interval === "year" ? plan.amount / 12 : plan.amount));

/** Yearly saving against paying monthly for 12 months, in percent. */
export const yearlySaving = () => {
  const [monthly, yearly] = PLANS;
  return Math.round((1 - yearly.amount / (monthly.amount * 12)) * 100);
};

/** Marker the server puts in a chat error when the free limit is reached; the app shows the plans. */
export const PAYWALL_MARK = "[premium]";
