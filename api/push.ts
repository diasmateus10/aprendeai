// Vercel serverless function for /api/push. Locally the same handler runs as Vite middleware (server/push.ts).

import type { IncomingMessage, ServerResponse } from "node:http";
import { readBody } from "../server/chat.js";
import { handlePush } from "../server/push.js";

export default async function handler(req: IncomingMessage & { body?: unknown }, res: ServerResponse) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end();
    return;
  }
  // Vercel may have parsed the JSON body already; otherwise read the raw stream.
  const raw =
    req.body === undefined ? await readBody(req) : typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  await handlePush(req, raw, res);
}
