// Premium subscriptions with Stripe: Checkout to subscribe (7-day trial, once per account), the Customer
// Portal to manage or cancel, and a webhook that mirrors each subscription into Supabase (`subscriptions`).
// The app only ever reads that table; Stripe is the source of truth.

import type { IncomingMessage, ServerResponse } from "node:http";
import Stripe from "stripe";
import type { Plugin } from "vite";
import { PLANS, TRIAL_DAYS, type PlanId } from "../src/data/plans.js";
import { readBody } from "./chat.js";
import { db, userFromRequest } from "./db.js";

let stripe: Stripe | null = null;

function client(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  stripe ??= new Stripe(key);
  return stripe;
}

const SITE = () => process.env.SITE_URL || "https://aprendeai-ruby.vercel.app";

function send(res: ServerResponse, status: number, body?: unknown) {
  res.statusCode = status;
  if (body === undefined) return res.end();
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

/** Price id for a plan, found by its lookup key (scripts/stripe-setup.mjs creates them). */
async function priceFor(s: Stripe, plan: PlanId): Promise<string> {
  const lookupKey = PLANS.find((p) => p.id === plan)!.lookupKey;
  const { data } = await s.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  if (!data[0]) throw new Error(`Stripe price "${lookupKey}" not found: run scripts/stripe-setup.mjs`);
  return data[0].id;
}

/** The account's Stripe customer, created (and remembered) on the first checkout. */
async function customerFor(s: Stripe, userId: string, email: string | undefined): Promise<{ id: string; hadTrial: boolean }> {
  const supabase = db()!;
  const { data } = await supabase.from("subscriptions").select("stripe_customer_id, had_trial").eq("user_id", userId).maybeSingle();
  if (data) return { id: data.stripe_customer_id, hadTrial: data.had_trial };
  const customer = await s.customers.create({ email, metadata: { user_id: userId } });
  const { error } = await supabase.from("subscriptions").insert({ user_id: userId, stripe_customer_id: customer.id });
  if (error) throw new Error(error.message);
  return { id: customer.id, hadTrial: false };
}

/** Copies the customer's latest subscription from Stripe into Supabase. */
export async function syncCustomer(customerId: string) {
  const s = client()!;
  const supabase = db()!;
  const { data: subs } = await s.subscriptions.list({ customer: customerId, status: "all", limit: 1 });
  const sub = subs[0];
  const item = sub?.items.data[0];
  const plan = PLANS.find((p) => p.lookupKey === item?.price.lookup_key)?.id ?? null;
  const row = {
    stripe_subscription_id: sub?.id ?? null,
    status: sub?.status ?? null,
    plan,
    current_period_end: item ? new Date(item.current_period_end * 1000).toISOString() : null,
    trial_end: sub?.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
    cancel_at_period_end: sub?.cancel_at_period_end ?? false,
    updated_at: new Date().toISOString(),
    // Any subscription (even a canceled one) means this account already used its trial.
    ...(sub ? { had_trial: true } : {}),
  };
  const { error } = await supabase.from("subscriptions").update(row).eq("stripe_customer_id", customerId);
  if (error) throw new Error(error.message);
}

async function handleCheckout(req: IncomingMessage, res: ServerResponse, rawBody: string) {
  const user = await userFromRequest(req);
  if (!user) return send(res, 401);
  let plan: PlanId;
  try {
    plan = JSON.parse(rawBody).plan;
  } catch {
    return send(res, 400);
  }
  if (!PLANS.some((p) => p.id === plan)) return send(res, 400);
  const s = client()!;
  const customer = await customerFor(s, user.id, user.email);
  const session = await s.checkout.sessions.create({
    mode: "subscription",
    customer: customer.id,
    line_items: [{ price: await priceFor(s, plan), quantity: 1 }],
    subscription_data: {
      metadata: { user_id: user.id },
      ...(customer.hadTrial ? {} : { trial_period_days: TRIAL_DAYS }),
    },
    allow_promotion_codes: true,
    locale: "pt-BR",
    success_url: `${SITE()}/?checkout=success`,
    cancel_url: `${SITE()}/?checkout=cancel`,
  });
  send(res, 200, { url: session.url });
}

let portalId: string | undefined;

/** The portal settings made by scripts/stripe-setup.mjs (switch plan, cancel at period end). */
async function portalConfig(): Promise<string | undefined> {
  if (portalId) return portalId;
  const { data } = await client()!.billingPortal.configurations.list({ active: true, limit: 100 });
  portalId = data.find((c) => c.metadata?.app === "aprendeai")?.id;
  return portalId;
}

async function handlePortal(req: IncomingMessage, res: ServerResponse) {
  const user = await userFromRequest(req);
  if (!user) return send(res, 401);
  const { data } = await db()!.from("subscriptions").select("stripe_customer_id").eq("user_id", user.id).maybeSingle();
  if (!data) return send(res, 404);
  const session = await client()!.billingPortal.sessions.create({
    customer: data.stripe_customer_id,
    return_url: SITE(),
    locale: "pt-BR",
    configuration: await portalConfig(),
  });
  send(res, 200, { url: session.url });
}

/** After Checkout returns, the app asks for an immediate sync instead of waiting for the webhook. */
async function handleSync(req: IncomingMessage, res: ServerResponse) {
  const user = await userFromRequest(req);
  if (!user) return send(res, 401);
  const { data } = await db()!.from("subscriptions").select("stripe_customer_id").eq("user_id", user.id).maybeSingle();
  if (data) await syncCustomer(data.stripe_customer_id);
  send(res, 204);
}

const SUBSCRIPTION_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.trial_will_end",
  "checkout.session.completed",
  "invoice.paid",
  "invoice.payment_failed",
]);

/** Verifies and applies a Stripe webhook; returns the HTTP status to answer with. */
export async function processWebhook(rawBody: string, signature: string | null): Promise<number> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const s = client();
  if (!secret || !s || !db()) return 503;
  let event: Stripe.Event;
  try {
    // The signature covers the exact bytes Stripe sent, so the body must not be parsed first.
    event = s.webhooks.constructEvent(rawBody, signature ?? "", secret);
  } catch (e) {
    console.error("[billing] bad webhook signature:", (e as Error).message);
    return 400;
  }
  if (SUBSCRIPTION_EVENTS.has(event.type)) {
    const object = event.data.object as { customer?: string | { id: string } | null };
    const customer = typeof object.customer === "string" ? object.customer : object.customer?.id;
    try {
      if (customer) await syncCustomer(customer);
    } catch (e) {
      // 500 makes Stripe retry later.
      console.error("[billing] webhook sync failed:", (e as Error).message);
      return 500;
    }
  }
  return 200;
}

/**
 * Routes /api/billing/* (Vercel function api/billing/[action].ts and the dev middleware).
 * `rawBody` is given when the platform already read the request (Vercel parses JSON bodies).
 */
export async function handleBilling(action: string, req: IncomingMessage, res: ServerResponse, rawBody?: string) {
  if (req.method !== "POST") return send(res, 405);
  if (!client() || !db()) return send(res, 503);
  try {
    if (action === "checkout") return await handleCheckout(req, res, rawBody ?? (await readBody(req)));
    if (action === "portal") return await handlePortal(req, res);
    if (action === "sync") return await handleSync(req, res);
    if (action === "webhook") return send(res, await processWebhook(await readBody(req), req.headers["stripe-signature"] as string));
    send(res, 404);
  } catch (e) {
    console.error(`[billing] ${action} failed:`, (e as Error).message);
    if (!res.headersSent) send(res, 502);
  }
}

export function billingApi(): Plugin {
  const middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const match = req.url?.match(/^\/api\/billing\/(\w+)/);
    if (!match) return next();
    handleBilling(match[1], req, res);
  };
  return {
    name: "aprendeai-billing-api",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
