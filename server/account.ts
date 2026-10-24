// Account deletion (LGPD: the learner can have their data erased). Cancels the Stripe subscription right
// away, then deletes the Supabase user: every table keyed by user_id goes with it (on delete cascade).
// Stripe keeps its own payment records (invoices), which the business has to keep anyway.

import type { IncomingMessage, ServerResponse } from "node:http";
import Stripe from "stripe";
import type { Plugin } from "vite";
import { db, userFromRequest } from "./db.js";

function send(res: ServerResponse, status: number) {
  res.statusCode = status;
  res.end();
}

/** Ends the account's live subscriptions now, so a deleted account is never charged again. */
async function cancelSubscriptions(customerId: string) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return;
  const stripe = new Stripe(key);
  const { data } = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
  for (const sub of data) {
    if (sub.status !== "canceled" && sub.status !== "incomplete_expired") await stripe.subscriptions.cancel(sub.id);
  }
}

export async function handleDeleteAccount(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST") return send(res, 405);
  const supabase = db();
  if (!supabase) return send(res, 503);
  const user = await userFromRequest(req);
  if (!user) return send(res, 401);
  try {
    const { data } = await supabase.from("subscriptions").select("stripe_customer_id").eq("user_id", user.id).maybeSingle();
    // Stops here if Stripe fails: deleting the account first would leave a subscription nobody can cancel in the app.
    if (data?.stripe_customer_id) await cancelSubscriptions(data.stripe_customer_id);
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) throw new Error(error.message);
    send(res, 204);
  } catch (e) {
    console.error("[account] delete failed:", (e as Error).message);
    if (!res.headersSent) send(res, 502);
  }
}

export function accountApi(): Plugin {
  const middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith("/api/account/delete")) return next();
    handleDeleteAccount(req, res);
  };
  return {
    name: "aprendeai-account-api",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
