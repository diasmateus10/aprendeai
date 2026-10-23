// Vercel serverless function for /api/chat. Locally the same handler runs as Vite middleware (server/chat.ts).

import type Anthropic from "@anthropic-ai/sdk";
import type { IncomingMessage, ServerResponse } from "node:http";
import { clientIp, createClient, handleChat, NOT_CONFIGURED, readBody } from "../server/chat.js";

let client: Anthropic | null = null;

export default async function handler(req: IncomingMessage & { body?: unknown }, res: ServerResponse) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end();
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    res.statusCode = 503;
    res.end(`⚠️ ${NOT_CONFIGURED}`);
    return;
  }
  client ??= createClient(process.env.ANTHROPIC_API_KEY);
  // Vercel may have parsed the JSON body already; otherwise read the raw stream.
  const raw =
    req.body === undefined ? await readBody(req) : typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  await handleChat(client, raw, clientIp(req), res);
}
