// Prepares the Stripe account for AprendeAI Premium. Safe to run again: it reuses what already exists.
//   node scripts/stripe-setup.mjs            (uses STRIPE_SECRET_KEY from .env; test or live)
// Creates the product, the monthly/yearly prices (by lookup key), the Customer Portal settings and the
// webhook endpoint for the production site, and writes STRIPE_WEBHOOK_SECRET into .env.

import fs from "node:fs";
import Stripe from "stripe";

const ENV_FILE = new URL("../.env", import.meta.url);
const env = Object.fromEntries(
  fs
    .readFileSync(ENV_FILE, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const key = env.STRIPE_SECRET_KEY;
if (!key) throw new Error("Put STRIPE_SECRET_KEY in .env first.");
const stripe = new Stripe(key);
const site = env.SITE_URL || "https://aprendeai-ruby.vercel.app";
const mode = key.startsWith("sk_live_") ? "PRODUÇÃO" : "TESTE";

// Keep in sync with src/data/plans.ts.
const PLANS = [
  { lookupKey: "aprendeai_premium_monthly", amount: 1990, interval: "month", nickname: "Mensal" },
  { lookupKey: "aprendeai_premium_yearly", amount: 14900, interval: "year", nickname: "Anual" },
];

const products = await stripe.products.search({ query: "metadata['app']:'aprendeai'" });
const product =
  products.data[0] ??
  (await stripe.products.create({
    name: "AprendeAI Premium",
    description: "Curso completo, conversa com IA sem limite e Modo Kids completo.",
    metadata: { app: "aprendeai" },
  }));
console.log(`[${mode}] produto: ${product.id}`);

const prices = {};
for (const p of PLANS) {
  const found = (await stripe.prices.list({ lookup_keys: [p.lookupKey], active: true, limit: 1 })).data[0];
  const price =
    found ??
    (await stripe.prices.create({
      product: product.id,
      currency: "brl",
      unit_amount: p.amount,
      recurring: { interval: p.interval },
      lookup_key: p.lookupKey,
      nickname: p.nickname,
    }));
  prices[p.lookupKey] = price.id;
  console.log(`[${mode}] preço ${p.nickname}: ${price.id} (${found ? "já existia" : "criado"})`);
}

// Customer Portal: change card, see invoices, switch monthly/yearly, cancel at the end of the period.
const portalFeatures = {
  customer_update: { enabled: true, allowed_updates: ["email"] },
  invoice_history: { enabled: true },
  payment_method_update: { enabled: true },
  subscription_cancel: { enabled: true, mode: "at_period_end" },
  subscription_update: {
    enabled: true,
    default_allowed_updates: ["price"],
    proration_behavior: "create_prorations",
    products: [{ product: product.id, prices: Object.values(prices) }],
  },
};
const portals = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
const portal = portals.data.find((c) => c.metadata?.app === "aprendeai");
if (portal) await stripe.billingPortal.configurations.update(portal.id, { features: portalFeatures });
else
  await stripe.billingPortal.configurations.create({
    business_profile: { headline: "AprendeAI Premium" },
    features: portalFeatures,
    metadata: { app: "aprendeai" },
  });
console.log(`[${mode}] portal do cliente configurado`);

// Webhook for the production site; its signing secret is only shown at creation.
const url = `${site}/api/billing/webhook`;
const events = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.trial_will_end",
  "invoice.paid",
  "invoice.payment_failed",
];
const hooks = await stripe.webhookEndpoints.list({ limit: 100 });
const existing = hooks.data.find((h) => h.url === url);
if (existing) {
  await stripe.webhookEndpoints.update(existing.id, { enabled_events: events });
  console.log(`[${mode}] webhook já existia: ${url}${env.STRIPE_WEBHOOK_SECRET ? "" : " (a chave dele não está no .env; apague-o no Stripe e rode de novo)"}`);
} else {
  const hook = await stripe.webhookEndpoints.create({ url, enabled_events: events, description: "AprendeAI: assinaturas" });
  let text = fs.readFileSync(ENV_FILE, "utf8");
  text = /^STRIPE_WEBHOOK_SECRET=.*$/m.test(text)
    ? text.replace(/^STRIPE_WEBHOOK_SECRET=.*$/m, `STRIPE_WEBHOOK_SECRET=${hook.secret}`)
    : `${text.trimEnd()}\nSTRIPE_WEBHOOK_SECRET=${hook.secret}\n`;
  fs.writeFileSync(ENV_FILE, text);
  console.log(`[${mode}] webhook criado: ${url} (chave salva no .env como STRIPE_WEBHOOK_SECRET)`);
}
