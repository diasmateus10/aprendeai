// Vercel serverless function for /api/tts. Locally the same handler runs as Vite middleware (server/tts.ts).

import type { IncomingMessage, ServerResponse } from "node:http";
import { clientIp } from "../server/chat.js";
import { handleTts, ttsNotConfigured } from "../server/tts.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.end();
    return;
  }
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) return ttsNotConfigured(res);
  await handleTts(new URL(req.url ?? "/", "http://localhost"), clientIp(req), key, region, res);
}
