// Dev/preview server middleware that proxies the conversation practice to Google Gemini.
// The API key stays on the server (read from app/.env or the environment), never in the browser.

import { ApiError, GoogleGenAI, ThinkingLevel, type Content } from "@google/genai";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { TOPICS } from "../src/data/topics.js";
import { stylePrompt, type AiStyle } from "../src/data/aiStyle.js";

// "-latest" aliases follow Google's current models on the free tier. Flash-Lite answers in about half a second,
// which suits short spoken replies; the bigger Flash is often overloaded on the free tier, so it is the backup.
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";
const MAX_TURNS = 60;
const MAX_CHARS = 1500;

export const NOT_CONFIGURED =
  "A conversa com IA não está configurada. Defina GEMINI_API_KEY (em app/.env localmente, ou nas Environment Variables da Vercel).";

const LEVEL_STYLE: Record<string, string> = {
  iniciante: "very simple words, present tense, sentences of at most 8 words",
  basico: "simple everyday vocabulary and short sentences",
  intermediario: "natural everyday English with common phrasal verbs",
  avancado: "natural, fast native-like English with idioms and contractions",
};

function systemPrompt(topicId: string, level: string, style: ChatBody["style"]): string {
  const topic = TOPICS.find((t) => t.id === topicId)!;
  return `You are an English conversation partner in a speaking-practice app for native Brazilian Portuguese speakers.
Scenario: ${topic.scenario}
Learner level: ${level}. Use ${LEVEL_STYLE[level] ?? LEVEL_STYLE.basico}.

The learner chose how you talk:
${stylePrompt(style)}

Your replies are read aloud by text-to-speech and the learner answers by voice, so:
- Write plain spoken text only: no markdown, asterisks, lists or emojis.
- A correction, when your correction setting allows one, is a single line that starts with "💡", is written in Brazilian Portuguese, and is always the very last line of the reply, after your question.
- End almost every reply with a question that keeps the conversation going.
- The learner's message is a speech-recognition transcript: ignore missing punctuation and capitalization.
- If the learner writes in Portuguese or seems stuck, help them say it in English, then continue.
Start by opening the scenario in your chosen style.`;
}

const FEEDBACK_PROMPT = `You are an English teacher for native Brazilian Portuguese speakers.
You will receive the transcript of a short spoken English practice conversation (the learner's lines come from speech recognition).
Write feedback in Brazilian Portuguese, plain text (no markdown), in this exact shape:
Resumo: one sentence about how the conversation went.
Pontos fortes: two short items separated by " · ".
Para melhorar: up to three corrections, each as "frase dita → frase correta", separated by " · ".
Palavras novas: up to five useful English words or expressions from the conversation, separated by " · ".
Be encouraging and concrete.`;

type ChatBody = {
  topic: string;
  level: string;
  mode: "chat" | "feedback";
  messages: { role: "user" | "assistant"; content: string }[];
  /** Untrusted; stylePrompt() only uses known option ids. */
  style?: Partial<Record<keyof AiStyle, unknown>>;
};

function parseBody(raw: string): ChatBody | null {
  try {
    const b = JSON.parse(raw);
    if (!TOPICS.some((t) => t.id === b.topic)) return null;
    if (b.mode !== "chat" && b.mode !== "feedback") return null;
    if (!Array.isArray(b.messages) || b.messages.length > MAX_TURNS) return null;
    const messages = b.messages.map((m: { role: unknown; content: unknown }) => {
      if ((m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") throw new Error("bad message");
      return { role: m.role, content: m.content.slice(0, MAX_CHARS) };
    });
    const style = b.style && typeof b.style === "object" ? b.style : undefined;
    return { topic: b.topic, level: String(b.level), mode: b.mode, messages, style };
  } catch {
    return null;
  }
}

export function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 200_000) reject(new Error("too large"));
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

/** Client address, behind Vercel's proxy when deployed. */
export function clientIp(req: IncomingMessage): string {
  const fwd = req.headers["x-forwarded-for"];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(",")[0]?.trim();
  return first || req.socket.remoteAddress || "unknown";
}

// Daily per-person limits so a shared public link doesn't burn through the API quota.
// Kept in memory: good enough for one server, best effort on serverless (each instance counts on its own).
const SESSIONS_PER_DAY = Number(process.env.CHAT_SESSIONS_PER_DAY ?? 5);
const REQUESTS_PER_DAY = Number(process.env.CHAT_REQUESTS_PER_DAY ?? 100);
const usage = new Map<string, { day: string; sessions: number; requests: number }>();

function overLimit(ip: string, newSession: boolean): string | null {
  const day = new Date().toISOString().slice(0, 10);
  let u = usage.get(ip);
  if (!u || u.day !== day) {
    if (usage.size > 10_000) usage.clear();
    u = { day, sessions: 0, requests: 0 };
    usage.set(ip, u);
  }
  if (newSession && u.sessions >= SESSIONS_PER_DAY) {
    return `Você já fez ${SESSIONS_PER_DAY} conversas hoje. Volte amanhã para conversar de novo!`;
  }
  if (u.requests >= REQUESTS_PER_DAY) return "Limite diário de mensagens atingido. Volte amanhã!";
  if (newSession) u.sessions++;
  u.requests++;
  return null;
}

// The free tier often answers 503 ("high demand") or 429 for a few seconds; the other model is usually free then.
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-flash-latest";
const RETRYABLE = new Set([429, 500, 503]);
/** Spoken replies must feel live: an attempt that hasn't produced its first words by then is abandoned. */
const FIRST_CHUNK_MS = 9_000;

// Short spoken replies don't need reasoning, and thinking adds many seconds before the first word.
// Not every model accepts this setting, so models that reject it are remembered and called without it.
const THINKING = { thinkingLevel: ThinkingLevel.MINIMAL };
const noThinking = new Set<string>();

class FirstChunkTimeout extends Error {}

/**
 * Opens the stream and waits for its first chunk, retrying on the main model and then on the
 * fallback model when Gemini is overloaded or too slow. Returns the chunks as one async iterable.
 */
async function startStream(ai: GoogleGenAI, contents: Content[], systemInstruction: string) {
  const attempts = [MODEL, FALLBACK_MODEL, MODEL];
  for (let i = 0; ; i++) {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), FIRST_CHUNK_MS);
    const started = Date.now();
    try {
      const stream = await ai.models.generateContentStream({
        model: attempts[i],
        contents,
        config: {
          systemInstruction,
          maxOutputTokens: 2048,
          abortSignal: abort.signal,
          thinkingConfig: noThinking.has(attempts[i]) ? undefined : THINKING,
        },
      });
      const iterator = stream[Symbol.asyncIterator]();
      const first = await iterator.next();
      if (abort.signal.aborted) throw new FirstChunkTimeout();
      clearTimeout(timer);
      console.log(`[chat] ${attempts[i]} first chunk after ${Date.now() - started} ms`);
      return (async function* () {
        if (!first.done) yield first.value;
        for (let r = await iterator.next(); !r.done; r = await iterator.next()) yield r.value;
      })();
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof ApiError && error.status === 400 && !noThinking.has(attempts[i])) {
        console.warn(`[chat] ${attempts[i]} rejected the request; retrying without the thinking config`);
        noThinking.add(attempts[i]);
        i--;
        continue;
      }
      const timedOut = abort.signal.aborted || error instanceof FirstChunkTimeout;
      const retryable = timedOut || (error instanceof ApiError && RETRYABLE.has(error.status));
      if (i + 1 >= attempts.length || !retryable) throw timedOut ? new ApiError({ message: "timeout", status: 503 }) : error;
      console.warn(`[chat] ${attempts[i]} ${timedOut ? "timed out" : `returned ${(error as ApiError).status}`}; retrying with ${attempts[i + 1]}`);
      if (!timedOut) await new Promise((r) => setTimeout(r, 500));
    }
  }
}

export async function handleChat(ai: GoogleGenAI, rawBody: string, ip: string, res: ServerResponse) {
  const body = parseBody(rawBody);
  if (!body) {
    res.statusCode = 400;
    res.end("Pedido inválido.");
    return;
  }

  const limited = overLimit(ip, body.mode === "chat" && body.messages.length === 0);
  if (limited) {
    res.statusCode = 429;
    res.end(`⚠️ ${limited}`);
    return;
  }

  let contents: Content[];
  let systemInstruction: string;
  if (body.mode === "chat") {
    systemInstruction = systemPrompt(body.topic, body.level, body.style);
    // The opening turn has no learner message yet; a neutral cue starts the scenario.
    contents = body.messages.length
      ? body.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }))
      : [{ role: "user", parts: [{ text: "(The learner is ready. Start the conversation.)" }] }];
  } else {
    systemInstruction = FEEDBACK_PROMPT;
    const transcript = body.messages
      .map((m) => `${m.role === "user" ? "Learner" : "Partner"}: ${m.content}`)
      .join("\n");
    contents = [{ role: "user", parts: [{ text: transcript || "(The learner did not say anything.)" }] }];
  }

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  try {
    const stream = await startStream(ai, contents, systemInstruction);
    let wrote = false;
    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) {
        res.write(text);
        wrote = true;
      }
    }
    // Gemini returns no text when a safety filter blocks the reply.
    if (!wrote) res.write("(Não consegui responder a isso. Vamos mudar de assunto?)");
    res.end();
  } catch (error) {
    let message = "Erro ao falar com a IA. Tente de novo.";
    if (error instanceof ApiError) {
      if (error.status === 429) message = "A IA está muito ocupada agora (limite do plano gratuito). Espere um minuto e tente de novo.";
      else if (error.status === 400 && /api key/i.test(error.message)) message = "Chave da API inválida. Confira GEMINI_API_KEY.";
      else if (error.status === 401 || error.status === 403) message = "Chave da API inválida ou sem permissão. Confira GEMINI_API_KEY.";
      console.error(`[chat] Gemini API error ${error.status}:`, error.message);
    } else console.error("[chat]", error);
    if (!res.headersSent) res.statusCode = 502;
    res.end(`\n⚠️ ${message}`);
  }
}

export function chatApi(apiKey: string | undefined): Plugin {
  let ai: GoogleGenAI | null = null;
  const middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.url !== "/api/chat" || req.method !== "POST") return next();
    if (!apiKey) {
      res.statusCode = 503;
      res.end(`⚠️ ${NOT_CONFIGURED}`);
      return;
    }
    ai ??= new GoogleGenAI({ apiKey });
    readBody(req)
      .then((raw) => handleChat(ai!, raw, clientIp(req), res))
      .catch((e) => {
        console.error("[chat]", e);
        res.statusCode = 500;
        res.end();
      });
  };
  return {
    name: "aprendeai-chat-api",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
