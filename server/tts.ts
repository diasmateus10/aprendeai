// Natural text-to-speech through Azure AI Speech (neural voices), used by every "listen" in the app.
// The key stays on the server (AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in app/.env or the environment).

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { clientIp } from "./chat.js";
import { allow } from "./db.js";

/** Adults hear Ava (US) or Sonia (UK); the Kids mode hears a child's voice, Ana (US) or Maisie (UK). */
const VOICES: Record<string, string> = {
  "adult:en-US": "en-US-AvaNeural",
  "adult:en-GB": "en-GB-SoniaNeural",
  "kids:en-US": "en-US-AnaNeural",
  "kids:en-GB": "en-GB-MaisieNeural",
};
const MAX_CHARS = 600;

// Per-person daily limit so a shared public link doesn't burn through the free 500k characters a month.
// Cached replies (the same word or line again) are served by the CDN and don't reach this counter.
const REQUESTS_PER_DAY = Number(process.env.TTS_REQUESTS_PER_DAY ?? 600);

const XML: Record<string, string> = { "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" };
const escapeXml = (text: string) => text.replace(/[<>&'"]/g, (c) => XML[c]);

export async function handleTts(url: URL, ip: string, key: string, region: string, res: ServerResponse) {
  const text = (url.searchParams.get("t") ?? "").replace(/[\u0000-\u001f]/g, " ").trim();
  const kind = url.searchParams.get("v") === "kids" ? "kids" : "adult";
  const accent = url.searchParams.get("a") === "en-GB" ? "en-GB" : "en-US";
  const slow = url.searchParams.get("s") === "1";
  if (!text || text.length > MAX_CHARS) {
    res.statusCode = 400;
    res.end();
    return;
  }
  if (!(await allow(ip, "tts", REQUESTS_PER_DAY))) {
    res.statusCode = 429;
    res.end();
    return;
  }

  // "Devagar" slows the voice down on the server, which keeps it natural instead of stretching the audio,
  // and puts a short pause between the words of short phrases.
  const words = text.split(/\s+/);
  const body = slow && words.length <= 10 ? words.map(escapeXml).join('<break time="250ms"/>') : escapeXml(text);
  const ssml =
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${accent}">` +
    `<voice name="${VOICES[`${kind}:${accent}`]}"><prosody rate="${slow ? "-50%" : "0%"}">${body}</prosody></voice></speak>`;
  try {
    const azure = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
        "User-Agent": "aprendeai",
      },
      body: ssml,
      signal: AbortSignal.timeout(15_000),
    });
    if (!azure.ok) {
      console.error(`[tts] Azure error ${azure.status}:`, await azure.text().catch(() => ""));
      res.statusCode = 502;
      res.end();
      return;
    }
    const audio = Buffer.from(await azure.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    // The same text and voice always give the same audio, so the CDN and the browser keep it.
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=31536000, immutable");
    res.end(audio);
  } catch (error) {
    console.error("[tts]", error);
    res.statusCode = 502;
    res.end();
  }
}

/** Answers 503 when the key is missing, which tells the app to use the device voices instead. */
export function ttsNotConfigured(res: ServerResponse) {
  res.statusCode = 503;
  res.end();
}

export function ttsApi(key: string | undefined, region: string | undefined): Plugin {
  const middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith("/api/tts") || req.method !== "GET") return next();
    if (!key || !region) return ttsNotConfigured(res);
    handleTts(new URL(req.url, "http://localhost"), clientIp(req), key, region, res);
  };
  return {
    name: "aprendeai-tts-api",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
