// Voice turns heard on the server (/api/talk): the WAV the app records, Azure's recognition with the Portuguese
// retry, and the whole turn (hear → reply → voice) with Azure and the AI faked. Run with `npm run test:unit`.

import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import type Anthropic from "@anthropic-ai/sdk";
import type { ServerResponse } from "node:http";
import { encodeWav, resample, TARGET_RATE, trimSilence } from "../../src/lib/recorder";
import { SttUnavailable, transcribe } from "../../server/stt";
import { FirstSentence, handleTalk, spokenPart, type TalkEvent } from "../../server/talk";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Replaces fetch: STT and TTS calls are answered by `azure`, and every call is logged. */
function fakeAzure(azure: (url: string, body: unknown) => Response) {
  const calls: { url: string; body: unknown }[] = [];
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: init?.body });
    return azure(url, init?.body);
  }) as typeof fetch;
  return calls;
}

const sttResult = (text: string, confidence: number) =>
  Response.json({ RecognitionStatus: "Success", DisplayText: text, NBest: [{ Confidence: confidence, Display: text }] });
const noMatch = () => Response.json({ RecognitionStatus: "NoMatch" });

/** One second of a 440 Hz tone at 16 kHz, as the app would send it. */
function toneWav(): Buffer {
  const samples = new Float32Array(TARGET_RATE).map((_, i) => 0.3 * Math.sin((2 * Math.PI * 440 * i) / TARGET_RATE));
  return Buffer.from(encodeWav(samples, TARGET_RATE));
}

/** Captures what a handler writes to the response (streamed NDJSON events or a plain JSON error). */
function fakeRes() {
  const out = { status: 200, headers: {} as Record<string, string>, body: "" };
  const res = {
    set statusCode(v: number) {
      out.status = v;
    },
    get statusCode() {
      return out.status;
    },
    headersSent: false,
    setHeader(k: string, v: string) {
      out.headers[k.toLowerCase()] = v;
    },
    write(chunk: string) {
      out.body += chunk;
      return true;
    },
    end(b?: string) {
      out.body += b ?? "";
    },
  } as unknown as ServerResponse;
  return { res, out };
}

/** The streamed events, in order. */
function events(body: string): TalkEvent[] {
  return body
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as TalkEvent);
}

/** An AI client that streams a scripted reply in small pieces; `asked` keeps every request. */
function fakeAi(reply: string) {
  const asked: { system: string; messages: { role: string; content: unknown }[] }[] = [];
  const pieces = reply.match(/[\s\S]{1,6}/g) ?? [];
  const ai = {
    beta: {
      messages: {
        stream: (params: { system: string; messages: { role: string; content: unknown }[] }) => {
          asked.push(params);
          return {
            async *[Symbol.asyncIterator]() {
              for (const text of pieces) yield { type: "content_block_delta", delta: { type: "text_delta", text } };
            },
            finalMessage: async () => ({ stop_reason: "end_turn" }),
          };
        },
      },
    },
  } as unknown as Anthropic;
  return { ai, asked };
}

const student = async () => ({ id: "00000000-0000-4000-8000-000000000001" });

function talkBody(extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    topic: "cafe",
    level: "basico",
    messages: [{ role: "assistant", content: "Hi! What can I get you?" }],
    style: { accent: "en-US" },
    audio: toneWav().toString("base64"),
    ...extra,
  });
}

describe("gravação (WAV de 16 kHz)", () => {
  test("reamostra 48 kHz para 16 kHz mantendo a duração", () => {
    const out = resample(new Float32Array(48000), 48000, TARGET_RATE);
    assert.equal(out.length, 16000);
  });

  test("gera um WAV PCM mono de 16 bits com o cabeçalho certo", () => {
    const wav = encodeWav(new Float32Array([0, 1, -1]), TARGET_RATE);
    const v = new DataView(wav.buffer);
    assert.equal(String.fromCharCode(...wav.slice(0, 4)), "RIFF");
    assert.equal(String.fromCharCode(...wav.slice(8, 12)), "WAVE");
    assert.equal(v.getUint16(22, true), 1, "mono");
    assert.equal(v.getUint32(24, true), 16000, "taxa");
    assert.equal(v.getUint16(34, true), 16, "bits");
    assert.equal(v.getUint32(40, true), 6, "3 amostras de 2 bytes");
    assert.equal(v.getInt16(46, true), 0x7fff);
    assert.equal(v.getInt16(48, true), -0x8000);
  });
});

describe("reconhecimento no Azure", () => {
  test("inglês com boa confiança: uma chamada só, no sotaque do aluno", async () => {
    const calls = fakeAzure(() => sttResult("I want a coffee.", 0.92));
    const t = await transcribe(toneWav(), "en-GB", "key", "brazilsouth");
    assert.deepEqual(t, { text: "I want a coffee.", confidence: 0.92, lang: "en-GB" });
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /brazilsouth\.stt\.speech\.microsoft\.com.*language=en-GB/);
  });

  test("sem entender em inglês, tenta em português (aluno travou)", async () => {
    const calls = fakeAzure((url) => (url.includes("pt-BR") ? sttResult("Como fala café com leite?", 0.81) : noMatch()));
    const t = await transcribe(toneWav(), "en-US", "key", "eastus");
    assert.equal(t.lang, "pt-BR");
    assert.equal(t.text, "Como fala café com leite?");
    assert.equal(calls.length, 2);
  });

  test("chave inválida ou cota grátis acabou: avisa para o app usar o microfone do navegador", async () => {
    fakeAzure(() => new Response("Out of call volume quota", { status: 403 }));
    await assert.rejects(transcribe(toneWav(), "en-US", "key", "eastus"), SttUnavailable);
  });
});

describe("voz da resposta em partes", () => {
  test("a 1ª frase sai assim que termina (se não for curtinha), e o resto depois", () => {
    const s = new FirstSentence();
    assert.equal(s.push("Oh! "), null, "frase curta demais espera a próxima");
    assert.equal(s.push("That sounds like fun"), null, "ainda sem ponto final");
    assert.equal(s.push(". Where did"), "Oh! That sounds like fun.");
    assert.equal(s.push(" you go?"), null, "só uma vez");
    assert.equal(s.rest("Oh! That sounds like fun. Where did you go?"), "Where did you go?");
  });

  test("a linha 💡 nunca vai para a voz, mesmo no meio da resposta", () => {
    const reply = 'Nice!\n💡 "I goed" → "I went" (passado de go)\nWhat else did you do?';
    assert.equal(spokenPart(reply), "Nice! What else did you do?");
    const s = new FirstSentence();
    assert.equal(s.push(reply), "Nice!", "antes da 💡 já é a primeira parte");
    assert.equal(s.rest(reply), "What else did you do?");
  });

  test("resposta de uma frase só: sem segunda parte", () => {
    const s = new FirstSentence();
    s.push("Sure, one iced coffee coming up! ");
    assert.equal(s.rest("Sure, one iced coffee coming up!"), null);
  });
});

describe("corte de silêncio da gravação", () => {
  test("tira o silêncio do começo e do fim, deixando uma margem", () => {
    const rate = 1000;
    const samples = new Float32Array(3000); // 1 s silence, 1 s voice, 1 s silence
    samples.fill(0.5, 1000, 2000);
    const out = trimSilence(samples, rate, 0.5);
    assert.equal(out.length, 1000 + 2 * 250, "a voz mais 0,25 s de cada lado");
  });

  test("só silêncio: devolve como veio", () => {
    const samples = new Float32Array(500);
    assert.equal(trimSilence(samples, 1000, 0).length, 500);
  });
});

describe("/api/talk: uma fala do aluno numa chamada só", () => {
  test("manda o que ouviu primeiro, a resposta aos poucos e a voz da 1ª frase antes do resto, sem ler a correção", async () => {
    const calls = fakeAzure((url, body) =>
      url.includes(".stt.")
        ? sttResult("I want coffee.", 0.9)
        : new Response(new TextEncoder().encode(`mp3:${String(body).match(/<prosody[^>]*>(.*?)<\/prosody>/)![1]}`), { status: 200 }),
    );
    const reply = 'Great choice, coming right up! Do you want it hot or iced?\n💡 "I want coffee" → "I\'d like a coffee" (mais educado)';
    const { ai, asked } = fakeAi(reply);
    const { res, out } = fakeRes();
    await handleTalk({ ai, speechKey: "key", speechRegion: "eastus", user: student }, talkBody(), res, {});

    assert.equal(out.status, 200);
    assert.match(out.headers["content-type"], /ndjson/);
    const evs = events(out.body);
    const types = evs.map((e) => e.type);
    assert.equal(types[0], "user", "o que o aluno disse vem antes de tudo");
    assert.deepEqual(evs[0], { type: "user", text: "I want coffee." });
    assert.ok(types.indexOf("delta") > 0 && types.indexOf("delta") < types.indexOf("reply"), "a resposta chega aos poucos");
    assert.equal(types.at(-1), "done");
    const replyEv = evs.find((e) => e.type === "reply") as Extract<TalkEvent, { type: "reply" }>;
    assert.equal(replyEv.text, reply);

    // Two clips: the first sentence, then the rest; neither has the Portuguese correction.
    const audio = evs.filter((e) => e.type === "audio") as Extract<TalkEvent, { type: "audio" }>[];
    assert.deepEqual(
      audio.map((a) => a.text),
      ["Great choice, coming right up!", "Do you want it hot or iced?"],
    );
    assert.equal(Buffer.from(audio[0].audio!, "base64").toString(), "mp3:Great choice, coming right up!");
    for (const c of calls.filter((c) => c.url.includes(".tts."))) assert.doesNotMatch(String(c.body), /💡|educado/);

    // The AI got the history plus what was heard.
    assert.deepEqual(asked[0].messages.at(-1), { role: "user", content: "I want coffee." });
  });

  test("não entendeu nada: avisa vazio e não gasta uma chamada da IA", async () => {
    fakeAzure(() => noMatch());
    const { ai, asked } = fakeAi("never");
    const { res, out } = fakeRes();
    await handleTalk({ ai, speechKey: "key", speechRegion: "eastus", user: student }, talkBody(), res, {});
    assert.equal(out.status, 200);
    assert.deepEqual(
      events(out.body).map((e) => e.type),
      ["user", "done"],
    );
    assert.equal((events(out.body)[0] as Extract<TalkEvent, { type: "user" }>).text, "");
    assert.equal(asked.length, 0);
  });

  test("passou do limite do dia: avisa antes de qualquer coisa", async () => {
    fakeAzure(() => sttResult("Hello there.", 0.9));
    const { ai, asked } = fakeAi("never");
    const { res, out } = fakeRes();
    const limits = async () => ({ status: 429, text: "Limite diário de mensagens atingido. Volte amanhã!" });
    await handleTalk({ ai, speechKey: "key", speechRegion: "eastus", user: student, limits }, talkBody(), res, {});
    assert.equal(out.status, 429);
    assert.match(JSON.parse(out.body).error, /Limite diário/);
    assert.equal(asked.length, 0);
  });

  test("Azure indisponível: 503 com fallback, para o app trocar de microfone", async () => {
    fakeAzure(() => new Response("quota", { status: 429 }));
    const { ai } = fakeAi("never");
    const { res, out } = fakeRes();
    await handleTalk({ ai, speechKey: "key", speechRegion: "eastus", user: student }, talkBody(), res, {});
    assert.equal(out.status, 503);
    assert.equal(JSON.parse(out.body).fallback, true);
  });

  test("sem conta: 401; áudio vazio ou tema desconhecido: 400", async () => {
    const { ai } = fakeAi("never");
    let r = fakeRes();
    await handleTalk({ ai, speechKey: "k", speechRegion: "eastus", user: async () => null }, talkBody(), r.res, {});
    assert.equal(r.out.status, 401);
    r = fakeRes();
    await handleTalk({ ai, speechKey: "k", speechRegion: "eastus", user: student }, talkBody({ audio: "" }), r.res, {});
    assert.equal(r.out.status, 400);
    r = fakeRes();
    await handleTalk({ ai, speechKey: "k", speechRegion: "eastus", user: student }, talkBody({ topic: "hack" }), r.res, {});
    assert.equal(r.out.status, 400);
  });
});
