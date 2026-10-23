// Vercel serverless function for /api/billing/{checkout,portal,sync}. Locally the same handler runs as
// Vite middleware (server/billing.ts). The webhook has its own raw-body handler (webhook.ts).

import type { IncomingMessage, ServerResponse } from "node:http";
import { handleBilling } from "../../server/billing.js";

export default async function handler(
  req: IncomingMessage & { query?: Record<string, string | string[]>; body?: unknown },
  res: ServerResponse,
) {
  const action = String(req.query?.action ?? new URL(req.url ?? "/", "http://localhost").pathname.split("/").pop() ?? "");
  // Vercel has already parsed a JSON body into req.body; hand it over as text.
  const raw = req.body === undefined ? undefined : typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  await handleBilling(action, req, res, raw);
}
