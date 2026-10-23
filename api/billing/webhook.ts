// Stripe webhook. A Web-standard handler gets the raw body untouched, which the signature check needs
// (the classic (req, res) handler would receive the JSON already parsed).

import { processWebhook } from "../../server/billing.js";

export async function POST(request: Request): Promise<Response> {
  const status = await processWebhook(await request.text(), request.headers.get("stripe-signature"));
  return new Response(status === 200 ? '{"received":true}' : null, { status, headers: { "Content-Type": "application/json" } });
}
