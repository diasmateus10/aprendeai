// Vercel serverless function for /api/chat. Locally the same handler runs as Vite middleware (server/chat.ts).

import { GoogleGenAI } from "@google/genai";
import type { IncomingMessage, ServerResponse } from "node:http";
import { clientIp, handleChat, NOT_CONFIGURED, readBody } from "../server/chat.js";

let ai: GoogleGenAI | null = null;

export default async function handler(req: IncomingMessage & { body?: unknown }, res: ServerResponse) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end();
    return;
  }
  if (!process.env.GEMINI_API_KEY) {
    res.statusCode = 503;
    res.end(`⚠️ ${NOT_CONFIGURED}`);
    return;
  }
  ai ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  // Vercel may have parsed the JSON body already; otherwise read the raw stream.
  const raw =
    req.body === undefined ? await readBody(req) : typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  await handleChat(ai, raw, clientIp(req), res);
}
