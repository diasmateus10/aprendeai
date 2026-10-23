// Dev/preview server middleware that proxies the conversation practice to Claude (Anthropic API).
// The API key stays on the server (read from app/.env or the environment), never in the browser.

import Anthropic from "@anthropic-ai/sdk";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { TOPICS } from "../src/data/topics.js";
import { stylePrompt, type AiStyle } from "../src/data/aiStyle.js";

// Haiku is the fastest and cheapest model, which suits short spoken replies on a public link.
// ANTHROPIC_MODEL overrides it, e.g. claude-opus-5-5 for richer conversation at a much higher cost.
const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";
// Short spoken replies need little reasoning, and less effort means the first word comes sooner.
const EFFORT = "low";
const MAX_TURNS = 60;
const MAX_CHARS = 1500;

export const NOT_CONFIGURED =
  "A conversa com IA não está configurada. Defina ANTHROPIC_API_KEY (em app/.env localmente, ou nas Environment Variables da Vercel).";

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

/** Spoken replies must feel live; the SDK retries 429/5xx on its own within this budget. */
const REQUEST_TIMEOUT_MS = 30_000;

export function createClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: 2 });
}

export async function handleChat(client: Anthropic, rawBody: string, ip: string, res: ServerResponse) {
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

  let messages: Anthropic.Beta.BetaMessageParam[];
  let system: string;
  if (body.mode === "chat") {
    system = systemPrompt(body.topic, body.level, body.style);
    // The opening turn has no learner message yet; a neutral cue starts the scenario.
    messages = [{ role: "user", content: "(The learner is ready. Start the conversation.)" }, ...body.messages];
  } else {
    system = FEEDBACK_PROMPT;
    const transcript = body.messages
      .map((m) => `${m.role === "user" ? "Learner" : "Partner"}: ${m.content}`)
      .join("\n");
    messages = [{ role: "user", content: transcript || "(The learner did not say anything.)" }];
  }

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  const started = Date.now();
  try {
    // Haiku has no server-side fallback; the other models retry a safety decline on Anthropic's recommended model.
    const fallback = !MODEL.startsWith("claude-haiku");
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 2048,
      system,
      messages,
      output_config: { effort: EFFORT },
      ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });
    let wrote = false;
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        if (!wrote) console.log(`[chat] ${MODEL} first words after ${Date.now() - started} ms`);
        res.write(event.delta.text);
        wrote = true;
      }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal" || !wrote) res.write("(Não consegui responder a isso. Vamos mudar de assunto?)");
    res.end();
  } catch (error) {
    let message = "Erro ao falar com a IA. Tente de novo.";
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      message = "Chave da API inválida ou sem permissão. Confira ANTHROPIC_API_KEY.";
    } else if (error instanceof Anthropic.RateLimitError) {
      message = "A IA está muito ocupada agora. Espere um minuto e tente de novo.";
    } else if (error instanceof Anthropic.BadRequestError && /credit balance/i.test(error.message)) {
      message = "A conta da Anthropic está sem créditos. Adicione créditos no Console.";
    } else if (error instanceof Anthropic.APIConnectionTimeoutError) {
      message = "A IA demorou demais para responder. Tente de novo.";
    }
    if (error instanceof Anthropic.APIError) console.error(`[chat] Anthropic API error ${error.status}:`, error.message);
    else console.error("[chat]", error);
    if (!res.headersSent) res.statusCode = 502;
    res.end(`\n⚠️ ${message}`);
  }
}

export function chatApi(apiKey: string | undefined): Plugin {
  let client: Anthropic | null = null;
  const middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.url !== "/api/chat" || req.method !== "POST") return next();
    if (!apiKey) {
      res.statusCode = 503;
      res.end(`⚠️ ${NOT_CONFIGURED}`);
      return;
    }
    client ??= createClient(apiKey);
    readBody(req)
      .then((raw) => handleChat(client!, raw, clientIp(req), res))
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
