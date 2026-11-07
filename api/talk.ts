// Vercel serverless function for /api/talk (one voice turn). Locally the same handler runs as Vite middleware (server/talk.ts).

import type Anthropic from "@anthropic-ai/sdk";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createClient, readBody } from "../server/chat.js";
import { serveTalk } from "../server/talk.js";

let client: Anthropic | null = null;

export default async function handler(req: IncomingMessage & { body?: unknown }, res: ServerResponse) {
  const env = {
    anthropicKey: process.env.ANTHROPIC_API_KEY,
    speechKey: process.env.AZURE_SPEECH_KEY,
    speechRegion: process.env.AZURE_SPEECH_REGION,
  };
  // Vercel may have parsed the JSON body already; otherwise read the raw stream.
  const readRaw = async () =>
    req.body === undefined ? readBody(req, 3_000_000) : typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  await serveTalk(req, res, env, () => (client ??= createClient(env.anthropicKey!)), readRaw);
}
