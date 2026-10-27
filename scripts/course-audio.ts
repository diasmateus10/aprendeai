// Records every fixed line the app says (lessons, theme units, flashcards, Kids) with Kokoro, an open
// voice model (Apache-2.0), into public/audio/<voice>/<key>.mp3 (normal) and <key>.s.mp3 ("Devagar").
// Runs on this computer once; only new or changed texts are recorded on later runs.
// Usage: npx tsx scripts/course-audio.ts [voice=us|uk] [limit=N]

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import ffmpeg from "ffmpeg-static";
import { KokoroTTS } from "kokoro-js";
import { units } from "../src/data/course";
import { allUnits } from "../src/data/themes";
import { VOCAB } from "../src/data/vocab";
import { KIDS_VOCAB, RHYMES } from "../src/data/kids";
import { clipKey, clipText } from "../src/lib/clips";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public", "audio");
const VOICES = { us: "af_heart", uk: "bf_emma" } as const;
const RATE = 24000;
/** "Devagar": up to this many words are said one by one with a pause; longer lines are just slower. */
const WORD_BY_WORD = 10;
const WORD_GAP_S = 0.35;
const SLOW_SPEED = 0.7;

/** Everything speak() is called with for fixed content (see the components). */
function texts(): string[] {
  const out = new Set<string>();
  const add = (t?: string) => t && out.add(clipText(t));
  for (const u of [...units, ...allUnits]) {
    u.phrases.forEach((p) => add(p.en));
    u.pairs.forEach((p) => (add(p.a), add(p.b)));
    u.exchanges.forEach((e) => (add(e.q), add(e.answers[0])));
  }
  VOCAB.forEach((c) => c.items.forEach((i) => add(i.en)));
  KIDS_VOCAB.forEach((c) =>
    c.items.forEach((i) => {
      add(i.en);
      add(`Yes! ${i.en}!`);
    }),
  );
  RHYMES.forEach((r) => r.lines.forEach((l) => add(l.en)));
  ["Great job!", "Hi! I am Kiko. Let's play in English!", "Hi! This is how I sound. Let's practice English together."].forEach(add);
  return [...out];
}

function toMp3(samples: Float32Array, file: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpeg as unknown as string, ["-y", "-loglevel", "error", "-f", "f32le", "-ar", String(RATE), "-ac", "1", "-i", "pipe:0", "-b:a", "32k", file]);
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
    p.stdin.end(Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength));
  });
}

function concat(parts: Float32Array[], gap: number): Float32Array {
  const silence = Math.round(gap * RATE);
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0) + silence * (parts.length - 1));
  let at = 0;
  parts.forEach((p, i) => {
    out.set(p, at);
    at += p.length + (i < parts.length - 1 ? silence : 0);
  });
  return out;
}

/** Cuts the silence the model leaves around a word said on its own, keeping a few milliseconds. */
function trim(a: Float32Array): Float32Array {
  const peak = a.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
  const quiet = Math.max(0.005, peak * 0.02);
  let start = a.findIndex((x) => Math.abs(x) > quiet);
  if (start < 0) return a;
  let end = a.length - 1;
  while (end > start && Math.abs(a[end]) <= quiet) end--;
  const pad = Math.round(0.03 * RATE);
  start = Math.max(0, start - pad);
  end = Math.min(a.length, end + pad);
  return a.slice(start, end);
}

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split("=")));
const voices = (args.voice ? [args.voice] : Object.keys(VOICES)) as (keyof typeof VOICES)[];
const all = texts().slice(0, args.limit ? Number(args.limit) : undefined);
console.log(`${all.length} textos`);

const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "q8", device: "cpu" });
const say = async (text: string, voice: string, speed = 1) => (await tts.generate(text, { voice: voice as "af_heart", speed })).audio as Float32Array;

for (const v of voices) {
  const dir = path.join(OUT, v);
  fs.mkdirSync(dir, { recursive: true });
  const words = new Map<string, Float32Array>();
  let made = 0;
  const started = Date.now();
  for (const text of all) {
    const key = clipKey(text);
    const normal = path.join(dir, `${key}.mp3`);
    const slow = path.join(dir, `${key}.s.mp3`);
    if (!fs.existsSync(normal)) await toMp3(await say(text, VOICES[v]), normal);
    if (!fs.existsSync(slow)) {
      const parts = text.split(" ");
      if (parts.length > 1 && parts.length <= WORD_BY_WORD) {
        const audio: Float32Array[] = [];
        for (const w of parts) {
          const clean = w.replace(/^[^\w']+|[^\w'!?]+$/g, "") || w;
          if (!words.has(clean)) words.set(clean, trim(await say(clean, VOICES[v], 0.85)));
          audio.push(words.get(clean)!);
        }
        await toMp3(concat(audio, WORD_GAP_S), slow);
      } else await toMp3(await say(text, VOICES[v], SLOW_SPEED), slow);
    }
    if (++made % 50 === 0) console.log(`${v}: ${made}/${all.length} (${Math.round((Date.now() - started) / 1000)}s)`);
  }
}

// The app only asks for files listed here, so a text without a clip goes straight to the device voice.
// Clips whose texts left the course are dropped from it (the files can be deleted by hand).
const current = new Set(texts().map(clipKey));
const manifest = Object.fromEntries(
  Object.keys(VOICES).map((v) => {
    const dir = path.join(OUT, v);
    const files = new Set(fs.existsSync(dir) ? fs.readdirSync(dir) : []);
    return [v, [...current].filter((k) => files.has(`${k}.mp3`) && files.has(`${k}.s.mp3`)).sort()];
  }),
);
fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest) + "\n");
console.log(`manifest: ${Object.entries(manifest).map(([v, k]) => `${v} ${k.length}`).join(", ")}`);
