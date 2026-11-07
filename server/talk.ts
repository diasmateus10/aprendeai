// One voice turn of the conversation in a single request: the learner's recorded answer goes in, and what they
// said, the partner's reply and the reply's natural voice come back. Hearing on the server (Azure) replaces the
// browser's speech recognition, which was unreliable (iPhone above all); text-only turns keep using /api/chat.
//
// The answer streams as NDJSON (one JSON event per line) so the learner waits as little as possible:
//   {"type":"user","text"}            what was heard, as soon as it is transcribed
//   {"type":"delta","text"}           the reply as the AI writes it
//   {"type":"audio","text","audio"}   the voice: the first sentence as soon as it is written, then the rest
//   {"type":"reply","text"}           the whole reply (with the optional 💡 correction line)
//   {"type":"done","timings"} | {"type":"error","error","userText"}
// Errors before anything streams (bad request, no account, limits, hearing unavailable) are plain JSON with a status.

import type Anthropic from "@anthropic-ai/sdk";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { aiErrorMessage, buildRequest, createClient, modelParams, NOT_CONFIGURED, overLimit, parseBody, readBody } from "./chat.js";
import { userFromRequest } from "./db.js";
import { saveConversation } from "./history.js";
import { SttUnavailable, transcribe } from "./stt.js";
import { synthesize, type Accent, type VoiceKind } from "./tts.js";

/** 60 s of 16 kHz mono WAV in base64 plus the history: Azure's short-audio limit is 60 s anyway. */
const MAX_BODY_CHARS = 2_800_000;

export type TalkEvent =
  | { type: "user"; text: string }
  | { type: "delta"; text: string }
  | { type: "audio"; text: string; audio: string | null }
  | { type: "reply"; text: string }
  | { type: "done"; timings: Timings }
  | { type: "error"; error: string; userText?: string };

export interface Timings {
  /** Account limits and transcription (they run side by side). */
  stt: number;
  /** Until the AI's first words, and until its whole reply. */
  aiFirst: number;
  ai: number;
  /** Until the first sentence's voice was sent: what the learner waits before hearing the partner. */
  firstAudio: number;
  total: number;
}

const normalize = (text: string) => text.replace(/\*/g, "").replace(/\s+/g, " ").trim();

/** The 💡 correction line is shown, not read aloud (same split the app does). */
export function spokenPart(reply: string): string {
  const clean = reply.replace(/\*/g, "");
  const i = clean.indexOf("💡");
  if (i === -1) return normalize(clean);
  const end = clean.indexOf("\n", i);
  return normalize(clean.slice(0, i) + (end === -1 ? "" : clean.slice(end)));
}

/** Shorter than this, a first "sentence" ("Oh!") waits for the next one, so the voice doesn't stutter. */
const MIN_FIRST_CHARS = 15;

/**
 * Picks the first sentence out of the reply while it streams, so its voice can be made before the AI finishes.
 * At most two clips per reply (the first sentence, then the rest): Azure's free tier allows few requests a minute.
 */
export class FirstSentence {
  private text = "";
  first: string | null = null;

  /** Adds streamed text; returns the first sentence once it is complete (only once). */
  push(delta: string): string | null {
    if (this.first !== null) return null;
    this.text += delta;
    const tip = this.text.indexOf("💡");
    const before = tip === -1 ? this.text : this.text.slice(0, tip);
    // A sentence ends at . ! ? (or …) followed by a space or a new line, i.e. the AI has moved past it.
    for (const m of before.matchAll(/[.!?…]+["')\]]?\s/g)) {
      const end = m.index! + m[0].length;
      if (normalize(before.slice(0, end)).length >= MIN_FIRST_CHARS) return (this.first = normalize(before.slice(0, end)));
    }
    // The correction line started before any long sentence: everything before it is the first clip.
    if (tip !== -1 && normalize(before)) return (this.first = normalize(before));
    return null;
  }

  /** What is left to say once the whole reply is known (null when the first clip said it all). */
  rest(reply: string): string | null {
    const all = spokenPart(reply);
    if (this.first === null) return all || null;
    if (!all.startsWith(this.first)) return null;
    return all.slice(this.first.length).trim() || null;
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

export interface TalkDeps {
  ai: Anthropic;
  speechKey: string;
  speechRegion: string;
  /** Who is asking; the signed-in Supabase account by default (tests pass their own). */
  user?: (headers: IncomingMessage["headers"]) => Promise<{ id: string } | null>;
  /** Limits check; the real daily limits by default (tests pass their own). */
  limits?: typeof overLimit;
}

export async function handleTalk(deps: TalkDeps, raw: string, res: ServerResponse, headers: IncomingMessage["headers"]) {
  const started = Date.now();
  let audioB64 = "";
  let body: ReturnType<typeof parseBody> = null;
  try {
    const parsed = JSON.parse(raw) as { audio?: unknown };
    audioB64 = typeof parsed.audio === "string" ? parsed.audio : "";
    delete parsed.audio;
    body = parseBody(JSON.stringify({ ...parsed, mode: "chat" }));
  } catch {
    body = null;
  }
  const wav = Buffer.from(audioB64, "base64");
  // A WAV header alone is 44 bytes; anything this small is a tap, not an answer.
  if (!body || wav.length < 1000) return sendJson(res, 400, { error: "Pedido inválido." });

  const user = await (deps.user ?? ((h) => userFromRequest({ headers: h })))(headers);
  if (!user) return sendJson(res, 401, { error: "⚠️ Entre na sua conta para conversar com a IA." });

  const accent: Accent = body.style?.accent === "en-GB" ? "en-GB" : "en-US";
  // Limits and hearing side by side: the limits are a few quick database reads, hearing takes most of a second.
  let userText: string;
  let limited: Awaited<ReturnType<typeof overLimit>>;
  try {
    const [limit, heard] = await Promise.all([
      (deps.limits ?? overLimit)(user.id, false),
      transcribe(wav, accent, deps.speechKey, deps.speechRegion),
    ]);
    limited = limit;
    userText = heard.text;
  } catch (error) {
    // The app switches to the browser's own recognition for the rest of the conversation.
    if (error instanceof SttUnavailable) return sendJson(res, 503, { error: "stt-unavailable", fallback: true });
    console.error("[talk] stt", error);
    return sendJson(res, 502, { error: "⚠️ Não consegui ouvir o áudio agora. Tente de novo." });
  }
  if (limited) return sendJson(res, limited.status, { error: `⚠️ ${limited.text}` });

  const timings: Timings = { stt: Date.now() - started, aiFirst: 0, ai: 0, firstAudio: 0, total: 0 };
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  const emit = (event: TalkEvent) => res.write(JSON.stringify(event) + "\n");
  emit({ type: "user", text: userText });
  if (!userText) {
    timings.total = Date.now() - started;
    emit({ type: "done", timings });
    return res.end();
  }

  const history = [...body.messages, { role: "user" as const, content: userText }];
  const { kids, system, messages } = await buildRequest({ ...body, messages: history }, user.id);
  const voice = { kind: (kids ? "kids" : "adult") as VoiceKind, accent, slow: false, key: deps.speechKey, region: deps.speechRegion };
  const speakAs = async (text: string) => {
    try {
      const mp3 = await synthesize(text, voice);
      return mp3 ? mp3.toString("base64") : null;
    } catch (error) {
      console.error("[talk] tts", error);
      return null;
    }
  };

  const splitter = new FirstSentence();
  // The first sentence's voice is made while the AI writes the rest, and sent the moment it is ready.
  let firstSent: Promise<void> = Promise.resolve();
  let reply = "";
  try {
    const stream = deps.ai.beta.messages.stream(modelParams(system, messages));
    for await (const event of stream) {
      if (event.type !== "content_block_delta" || event.delta.type !== "text_delta") continue;
      if (!reply) timings.aiFirst = Date.now() - started;
      reply += event.delta.text;
      emit({ type: "delta", text: event.delta.text });
      const first = splitter.push(event.delta.text);
      if (first) {
        firstSent = speakAs(first).then((audio) => {
          timings.firstAudio = Date.now() - started;
          emit({ type: "audio", text: first, audio });
        });
      }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal" || !reply.trim()) reply = "(Não consegui responder a isso. Vamos mudar de assunto?)";
  } catch (error) {
    await firstSent;
    // What they said still comes back, so it isn't lost when they tap "Tentar de novo".
    emit({ type: "error", error: `⚠️ ${aiErrorMessage(error)}`, userText });
    return res.end();
  }
  reply = reply.trim();
  timings.ai = Date.now() - started;
  emit({ type: "reply", text: reply });

  // The rest of the voice and the history are done side by side, after the first sentence went out.
  const rest = splitter.rest(reply);
  const restVoice = rest ? speakAs(rest) : Promise.resolve(null);
  // History (adult mode only). Saved before ending the response: serverless work after it may be cut off.
  const saved = !kids && body.sessionId ? saveConversation(user.id, body.sessionId, body.topic, body.level, history, reply) : null;
  await firstSent;
  if (rest) {
    const audio = await restVoice;
    if (!timings.firstAudio) timings.firstAudio = Date.now() - started;
    emit({ type: "audio", text: rest, audio });
  }
  await saved?.catch((e) => console.error("[talk] history", e));
  timings.total = Date.now() - started;
  console.log(`[talk] ${JSON.stringify(timings)}`);
  emit({ type: "done", timings });
  res.end();
}

/** Reads the request and answers; GET only tells the app whether voice turns are available here. */
export async function serveTalk(
  req: IncomingMessage,
  res: ServerResponse,
  env: { anthropicKey?: string; speechKey?: string; speechRegion?: string },
  client: () => Anthropic,
  /** Vercel may hand over the body already parsed; locally it is read from the stream. */
  readRaw: () => Promise<string> = () => readBody(req, MAX_BODY_CHARS),
) {
  const ready = !!(env.anthropicKey && env.speechKey && env.speechRegion);
  if (req.method === "GET") return sendJson(res, ready ? 200 : 503, { voice: ready });
  if (req.method !== "POST") return sendJson(res, 405, {});
  if (!ready) return sendJson(res, 503, { error: env.anthropicKey ? "stt-unavailable" : `⚠️ ${NOT_CONFIGURED}`, fallback: true });
  try {
    const raw = await readRaw();
    if (raw.length > MAX_BODY_CHARS) throw new Error("too large");
    await handleTalk({ ai: client(), speechKey: env.speechKey!, speechRegion: env.speechRegion! }, raw, res, req.headers);
  } catch (error) {
    console.error("[talk]", error);
    if (!res.headersSent) sendJson(res, 413, { error: "⚠️ A gravação ficou longa demais. Fale um pouco menos de cada vez." });
    else res.end();
  }
}

export function talkApi(env: { anthropicKey?: string; speechKey?: string; speechRegion?: string }): Plugin {
  let client: Anthropic | null = null;
  const middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.url !== "/api/talk") return next();
    void serveTalk(req, res, env, () => (client ??= createClient(env.anthropicKey!)));
  };
  return {
    name: "aprendeai-talk-api",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
