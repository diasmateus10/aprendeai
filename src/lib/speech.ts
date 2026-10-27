// Text-to-speech (escuta) and speech recognition (fala) via the Web Speech API.

import { CLIP_VOICES, clipKey } from "./clips";

let cachedVoice: SpeechSynthesisVoice | null = null;
/** "en-US" or "en-GB", chosen by the learner; drives the TTS voice and speech recognition. */
let accent = "en-US";
/** Voice the learner picked by name; null means the best-ranked one. */
let preferredVoice: string | null = null;

export function setAccent(lang: string) {
  if (lang === accent) return;
  accent = lang;
  cachedVoice = null;
}

export function setVoiceName(name: string | null) {
  if (name === preferredVoice) return;
  preferredVoice = name;
  cachedVoice = null;
}

const norm = (lang: string) => lang.replace("_", "-").toLowerCase();

/**
 * How natural a voice usually sounds. Browsers mix neural voices (Edge "Natural", Apple
 * "Premium"/"Enhanced"/Siri, Google's) with old robotic ones (Windows David/Zira, eSpeak,
 * macOS novelty voices), and the order they list them in says nothing about quality.
 */
function voiceScore(v: SpeechSynthesisVoice): number {
  const n = v.name.toLowerCase();
  let s = 0;
  if (/natural|neural/.test(n)) s += 100;
  if (/premium|siri/.test(n)) s += 90;
  if (/enhanced|improved|melhorad/.test(n)) s += 80;
  if (n.includes("google")) s += 60;
  if (n.includes("online")) s += 30;
  if (/\b(samantha|ava|allison|evan|nicky|zoe|daniel|kate|serena|arthur|martha|jamie|aaron)\b/.test(n)) s += 25;
  // Old robotic voices: Windows SAPI, eSpeak, and Apple's Eloquence and classic voices.
  if (/\b(david|zira|mark|hazel|george|espeak|fred|albert|ralph|kathy|junior|eddy|flo|reed|rocko|sandy|shelley|grandma|grandpa)\b/.test(n)) s -= 100;
  if (norm(v.lang) === accent.toLowerCase()) s += 20;
  return s;
}

/** Apple's novelty voices sing, whisper or bubble ("Good News", "Cellos"...): never usable for teaching. */
const NOVELTY = /\b(bad news|good news|bahh|bells|boing|bubbles|cellos|deranged|hysterical|jester|organ|princess|superstar|trinoids|whisper|wobble|zarvox)\b/i;

/** English voices this device offers, most natural first (current accent ranked higher). */
export function englishVoices(): SpeechSynthesisVoice[] {
  const voices = typeof window !== "undefined" ? window.speechSynthesis?.getVoices() ?? [] : [];
  return voices
    .filter((v) => norm(v.lang).startsWith("en") && !NOVELTY.test(v.name))
    .sort((a, b) => voiceScore(b) - voiceScore(a));
}

/** True for voices that typically sound natural, to label them in the picker. */
export function isNaturalVoice(v: SpeechSynthesisVoice): boolean {
  return voiceScore(v) >= 60;
}

/** Voices that failed to synthesize (Edge's online "Natural" voices do when offline); skipped from then on. */
const brokenVoices = new Set<string>();
/** Set once an online voice fails: the device's own voices are less natural but more reliable. */
let preferLocal = false;

function pickVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice) return cachedVoice;
  let voices = englishVoices().filter((v) => !brokenVoices.has(v.name));
  if (preferLocal && voices.some((v) => v.localService)) voices = voices.filter((v) => v.localService);
  cachedVoice = voices.find((v) => v.name === preferredVoice) ?? voices[0] ?? null;
  return cachedVoice;
}

const voiceListeners = new Set<() => void>();

/** Voices load asynchronously (and Chrome adds its online voices late); notifies when the list changes. */
export function onVoicesChanged(fn: () => void): () => void {
  voiceListeners.add(fn);
  return () => voiceListeners.delete(fn);
}

if (typeof window !== "undefined" && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = null;
    voiceListeners.forEach((fn) => fn());
  };
}

export const ttsSupported = typeof window !== "undefined" && "speechSynthesis" in window;

/** iPhones and iPads (iPadOS reports itself as a Mac with touch). */
export const isIOS =
  typeof navigator !== "undefined" &&
  (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Mac") && navigator.maxTouchPoints > 1));

// iOS only lets speech start from a tap; replies arrive after a fetch, so unlock it from the taps before.
// An empty utterance is used because iOS ignores `volume`, and it may drop a whitespace-only one without
// unlocking anything; the listeners stay until an unlock utterance has actually run.
if (ttsSupported) {
  const events = ["click", "touchend", "keydown"] as const;
  const done = () => events.forEach((e) => window.removeEventListener(e, unlock, true));
  const unlock = () => {
    if (window.speechSynthesis.speaking) return done();
    const u = new SpeechSynthesisUtterance("");
    u.onend = done;
    window.speechSynthesis.speak(u);
  };
  events.forEach((e) => window.addEventListener(e, unlock, true));
}

/** Splits text into sentence-sized chunks: Chrome's online voices go silent mid-way through utterances longer than ~15s. */
function chunk(text: string): string[] {
  const out: string[] = [];
  for (const s of text.match(/[^\n]+?(?:[.!?]+(?=\s|$)|$)/gm) ?? []) {
    const part = s.trim();
    if (!part) continue;
    const last = out[out.length - 1];
    if (last && last.length + part.length < 160) out[out.length - 1] = `${last} ${part}`;
    else out.push(part);
  }
  return out;
}

// Chrome garbage-collects utterances nothing references, and then never fires their onend.
let queue: SpeechSynthesisUtterance[] = [];
let speakId = 0;

/** Voices tried per line before giving up: online voices can fail without any error event. */
const MAX_VOICE_TRIES = 3;
/** A voice that hasn't started speaking by then is treated as broken. */
const START_TIMEOUT_MS = 3000;

// Natural voice: neural speech generated by the server (/api/tts, Azure AI Speech) and played as audio.
// Device voices are only the fallback, since many phones (iPhones without downloaded voices) only have robotic ones.

/** "unknown" until the first request; "off" when the server has no speech key, so the device voices are used. */
let serverTts: "unknown" | "on" | "off" = "unknown";
/** The Kids mode speaks with a child's voice. */
let voiceKind: "adult" | "kids" = "adult";

export function setVoiceKind(kind: "adult" | "kids") {
  voiceKind = kind;
}

/** True once the server's natural voice has worked; the device voice picker is moot then. */
export function usingServerVoice(): boolean {
  return serverTts === "on";
}

// One element for every clip: iOS lets an element play from code only after it played once during a tap.
const player = typeof Audio !== "undefined" ? new Audio() : null;
/** Resolves the speak() currently playing on `player`, when it is cut short. */
let endPlayback: (() => void) | null = null;
const clips = new Map<string, string>();
const MAX_CLIPS = 200;

/** A tiny silent WAV, played on the first tap to unlock `player` on iOS. */
function silentWav(): string {
  const samples = 800;
  const b = new Uint8Array(44 + samples);
  const v = new DataView(b.buffer);
  const tag = (o: number, s: string) => [...s].forEach((c, i) => (b[o + i] = c.charCodeAt(0)));
  tag(0, "RIFF");
  v.setUint32(4, 36 + samples, true);
  tag(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, 8000, true);
  v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  tag(36, "data");
  v.setUint32(40, samples, true);
  b.fill(128, 44);
  return "data:audio/wav;base64," + btoa(String.fromCharCode(...b));
}

if (player) {
  const events = ["click", "touchend", "keydown"] as const;
  const unlock = () => {
    if (endPlayback) return;
    player.src = silentWav();
    player
      .play()
      .then(() => events.forEach((e) => window.removeEventListener(e, unlock, true)))
      .catch(() => {});
  };
  events.forEach((e) => window.addEventListener(e, unlock, true));
}

/** Plays a short clip (feedback sounds) on the unlocked element, unless the server voice is speaking on it. */
export function playEffect(url: string) {
  if (!player || endPlayback) return;
  player.onended = player.onerror = null;
  player.src = url;
  void player.play().catch(() => {});
}

function stopPlayback() {
  player?.pause();
  endPlayback?.();
  endPlayback = null;
}

/** Fetches (or reuses) the server's audio for a line; null when the server voice is unavailable. */
async function fetchClip(text: string, slow: boolean): Promise<string | null> {
  const key = `${voiceKind}|${accent}|${slow ? 1 : 0}|${text}`;
  const hit = clips.get(key);
  if (hit) return hit;
  try {
    const params = new URLSearchParams({ t: text, v: voiceKind, a: accent, s: slow ? "1" : "0" });
    const res = await fetch(`/api/tts?${params}`);
    if (res.status === 503) serverTts = "off";
    if (!res.ok) return null;
    const url = URL.createObjectURL(await res.blob());
    serverTts = "on";
    if (clips.size >= MAX_CLIPS) {
      const [oldKey, oldUrl] = clips.entries().next().value!;
      URL.revokeObjectURL(oldUrl);
      clips.delete(oldKey);
    }
    clips.set(key, url);
    return url;
  } catch {
    return null;
  }
}

// Recorded voice (lib/clips.ts): the course's fixed lines, recorded once with a natural voice. The list is
// fetched once; until it arrives (or if it fails) everything uses the other voices.
let recorded: Record<string, Set<string>> = {};
if (typeof window !== "undefined") {
  fetch("/audio/manifest.json")
    .then((r) => (r.ok ? r.json() : {}))
    .then((m: Record<string, string[]>) => {
      recorded = Object.fromEntries(Object.entries(m).map(([v, keys]) => [v, new Set(keys)]));
    })
    .catch(() => {});
}

/** URL of the recorded clip for this line, or null. A voice the learner picked by name wins over it. */
function recordedClip(text: string, slow: boolean): string | null {
  if (preferredVoice) return null;
  const voice = CLIP_VOICES[accent as keyof typeof CLIP_VOICES];
  const key = clipKey(text);
  return voice && recorded[voice]?.has(key) ? `/audio/${voice}/${key}${slow ? ".s" : ""}.mp3` : null;
}

/** Plays a clip on the shared element; resolves when it ends or is cut off, false when it couldn't play. */
function playClip(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    const finish = (ok: boolean) => {
      if (endPlayback !== done) return;
      endPlayback = null;
      resolve(ok);
    };
    const done = () => finish(true);
    endPlayback = done;
    player!.onended = done;
    player!.onerror = () => finish(false);
    player!.src = src;
    player!.play().catch(() => finish(false));
  });
}

/** Longer texts (rare) go to the device voice, which splits them into sentences. */
const SERVER_MAX_CHARS = 600;

/** Speaks the text; resolves when it finishes, fails or is interrupted by another speak()/stopSpeaking(). */
export function speak(text: string, slow = false): Promise<void> {
  const id = speakId + 1;
  trace(`voice speak "${text.slice(0, 30)}"`);
  return speakLine(text, slow).finally(() => {
    trace(`voice done${id === speakId ? "" : " (cut off)"}`);
    // The mic must not open the instant a line ends (see listen).
    if (id === speakId) quietSince = Date.now();
  });
}

function speakLine(text: string, slow: boolean): Promise<void> {
  const id = ++speakId;
  stopPlayback();
  if (ttsSupported) window.speechSynthesis.cancel();
  const clean = text.replace(/\s+/g, " ").trim();
  const clip = player && clean ? recordedClip(clean, slow) : null;
  if (clip) {
    // Couldn't play (e.g. no tap yet on iPhone): the device voice gets its turn.
    return playClip(clip).then((ok) => (ok || id !== speakId ? undefined : speakWithDevice(text, slow, id)));
  }
  if (!player || serverTts === "off" || !clean || clean.length > SERVER_MAX_CHARS) return speakWithDevice(text, slow, id);
  return fetchClip(clean, slow).then((src) => {
    if (id !== speakId) return;
    if (!src) return speakWithDevice(text, slow, id);
    return new Promise<void>((resolve) => {
      const finish = () => {
        if (endPlayback !== finish) return;
        endPlayback = null;
        resolve();
      };
      endPlayback = finish;
      player.onended = finish;
      player.onerror = finish;
      player.src = src;
      // Blocked (no tap yet on iOS) or failed: resolve so the conversation doesn't stall.
      player.play().catch(finish);
    });
  });
}

/** "Devagar": slower speech plus a pause between words (0.6 alone was still too fast for beginners). */
const SLOW_RATE = 0.45;
const SLOW_GAP_MS = 450;

/** "Devagar" also says short sentences word by word (longer ones two words at a time), with a pause between. */
function slowParts(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return words;
  const size = words.length <= 10 ? 1 : 2;
  const out: string[] = [];
  for (let i = 0; i < words.length; i += size) out.push(words.slice(i, i + size).join(" "));
  return out;
}

/** Speaks with the device's own voices (Web Speech API). */
function speakWithDevice(text: string, slow: boolean, id: number): Promise<void> {
  return new Promise((resolve) => {
    const parts = slow ? slowParts(text) : chunk(text);
    if (!ttsSupported || parts.length === 0) return resolve();
    const synth = window.speechSynthesis;
    const interrupting = synth.speaking || synth.pending;
    synth.cancel();

    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let startTimer: ReturnType<typeof setTimeout> | undefined;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(startTimer);
      resolve();
    };

    let attempt = 0;
    const run = () => {
      const mine = ++attempt;
      if (id !== speakId) return done();
      const voice = pickVoice();
      // Drops the current voice and tries the next best one, up to MAX_VOICE_TRIES voices.
      const fail = () => {
        if (mine !== attempt) return;
        clearTimeout(startTimer);
        if (!voice || attempt >= MAX_VOICE_TRIES) return done();
        // Silence from a device voice means speech was blocked (iOS before a tap), not a broken voice:
        // dropping it would walk down to the worst voices on the list.
        if (voice.localService && silent) return done();
        brokenVoices.add(voice.name);
        if (!voice.localService) preferLocal = true;
        cachedVoice = null;
        synth.cancel();
        run();
      };
      // Safety net, restarted per voice: some engines never fire onend, which would stall the hands-free conversation.
      clearTimeout(timer);
      timer = setTimeout(done, 4000 + text.length * (slow ? 300 : 90) + (slow ? parts.length * SLOW_GAP_MS : 0));
      // Online voices (Google's in Chrome, Microsoft's "Natural" ones in Edge) sometimes stay silent without an error.
      clearTimeout(startTimer);
      let silent = false;
      startTimer = setTimeout(() => {
        silent = true;
        fail();
      }, START_TIMEOUT_MS);
      // Chrome can be left paused (e.g. after the tab was in the background) and then stays silent.
      synth.resume();
      queue = parts.map((p, i) => {
        const u = new SpeechSynthesisUtterance(p);
        if (voice) u.voice = voice;
        u.lang = voice?.lang ?? accent;
        // Neural voices sound most natural at their normal speed; slowing them down is what "Devagar" is for.
        u.rate = slow ? SLOW_RATE : 1;
        if (i === 0) u.onstart = () => mine === attempt && clearTimeout(startTimer);
        if (i === parts.length - 1) u.onend = () => mine === attempt && done();
        // "Devagar": the next word only after a pause, timed here (iPhone may ignore a low rate).
        else if (slow) u.onend = () => setTimeout(() => mine === attempt && id === speakId && synth.speak(queue[i + 1]), SLOW_GAP_MS);
        u.onerror = (e) => {
          if (mine !== attempt) return;
          // Interrupted on purpose, or not allowed yet (no tap): nothing is wrong with the voice.
          if (e.error === "interrupted" || e.error === "canceled" || e.error === "not-allowed") return done();
          // The voice itself failed: try the next one.
          fail();
        };
        return u;
      });
      if (slow) synth.speak(queue[0]);
      else queue.forEach((u) => synth.speak(u));
    };
    // Chrome sometimes drops a speak() issued right after cancel(), so give it a moment when interrupting.
    if (interrupting) setTimeout(run, 80);
    else run();
  });
}

/** When speech last ended or was cut off; the mic waits a moment after it (see listen). */
let quietSince = 0;

export function stopSpeaking() {
  speakId++;
  // Only when something was playing: a tap with nothing to cut off should open the mic right away, within the tap.
  if (endPlayback || (ttsSupported && (window.speechSynthesis.speaking || window.speechSynthesis.pending))) quietSince = Date.now();
  stopPlayback();
  if (ttsSupported) window.speechSynthesis.cancel();
}

type RecognitionCtor = new () => SpeechRecognitionLike;

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, RecognitionCtor | undefined>;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const sttSupported = getRecognitionCtor() !== null;

export interface ListenHandle {
  /** Stops listening and still delivers what was heard so far. */
  stop(): void;
  /** Stops listening and discards what was heard. */
  abort(): void;
}

export interface ListenOptions {
  /** Push-to-talk: listens until stop() (the finger leaves the button), however long the pauses, and then
   * delivers everything heard. */
  hold?: boolean;
}

export interface ListenCallbacks {
  onInterim?(text: string): void;
  onFinal(alternatives: string[]): void;
  onError?(error: string): void;
  onEnd?(): void;
}

/** Nothing heard by then: give up instead of listening forever. */
const NO_SPEECH_MS = 8000;
/** Silence after the learner's last words that ends the answer (Safari is slow to notice it). */
const SILENCE_MS = 1800;
/** Longest answer. */
const MAX_LISTEN_MS = 20000;
/** Longest push-to-talk answer. */
const MAX_HOLD_MS = 60000;
/** After stop(), how long the browser gets to report before we finish ourselves (iOS may never call onend). */
const END_GRACE_MS = 1500;
/** Gap between speech ending and the mic opening: opened right as a line ends, the mic can record nothing. */
const AFTER_SPEECH_MS = 300;
/** The browser never confirmed the mic opened by then: report "no-start" instead of pretending to listen. */
const START_CONFIRM_MS = 2500;
let micEverStarted = false;

/** Recent mic and voice events, shown in the conversation with ?debug: the mic fails on devices we can't test on. */
export const speechLog: string[] = [];
let logStart = 0;

function trace(msg: string) {
  logStart ||= Date.now();
  speechLog.push(`${((Date.now() - logStart) / 1000).toFixed(1)}s ${msg}`);
  if (speechLog.length > 80) speechLog.shift();
}

/** Listens for one English utterance and reports all recognition alternatives. Always ends: onFinal and
 * onEnd are called exactly once, even when the browser stalls, which happens on iPhone. */
export function listen(cb: ListenCallbacks, { hold = false }: ListenOptions = {}): ListenHandle {
  const Ctor = getRecognitionCtor();
  if (!Ctor) {
    cb.onError?.("not-supported");
    cb.onEnd?.();
    return { stop() {}, abort() {} };
  }
  const rec = new Ctor();
  rec.lang = accent;
  rec.interimResults = true;
  rec.maxAlternatives = 5;
  rec.continuous = hold;
  let delivered = false;
  let ended = false;
  let lastInterim = "";
  const timers: ReturnType<typeof setTimeout>[] = [];
  let silence: ReturnType<typeof setTimeout> | undefined;
  const later = (fn: () => void, ms: number) => timers.push(setTimeout(fn, ms));

  const deliver = (alts: string[]) => {
    if (delivered) return;
    delivered = true;
    cb.onFinal(alts);
  };
  const finish = () => {
    if (ended) return;
    ended = true;
    trace(`mic end (${delivered ? "delivered" : lastInterim ? `interim "${lastInterim}"` : "nothing heard"})`);
    timers.forEach(clearTimeout);
    clearTimeout(silence);
    // Safari often shows the words as interim results and never marks them final: use them.
    deliver(lastInterim ? [lastInterim] : []);
    cb.onEnd?.();
  };
  const stop = () => {
    if (ended) return;
    try {
      rec.stop();
    } catch {
      // Already stopped.
    }
    later(() => {
      try {
        rec.abort();
      } catch {
        // Already stopped.
      }
      finish();
    }, END_GRACE_MS);
  };

  rec.onresult = (e) => {
    if (hold) {
      // Everything said while the button is held, final parts and the one still being recognized.
      lastInterim = Array.from(e.results, (r) => r[0]?.transcript ?? "").join(" ").replace(/\s+/g, " ").trim();
      trace(`mic hold "${lastInterim}"`);
      cb.onInterim?.(lastInterim);
      return;
    }
    const result = e.results[e.results.length - 1];
    trace(`mic ${result.isFinal ? "final" : "interim"} "${result[0]?.transcript}"`);
    if (result.isFinal) {
      const alts: string[] = [];
      for (let i = 0; i < result.length; i++) alts.push(result[i].transcript);
      deliver(alts);
      stop();
    } else {
      lastInterim = result[0].transcript;
      cb.onInterim?.(lastInterim);
      clearTimeout(silence);
      silence = setTimeout(stop, SILENCE_MS);
    }
  };
  let started = false;
  rec.onstart = () => {
    started = true;
    micEverStarted = true;
    trace("mic onstart");
  };
  rec.onerror = (e) => {
    trace(`mic error ${e.error}`);
    cb.onError?.(e.error);
  };
  rec.onend = () => {
    trace("mic onend");
    finish();
  };
  const begin = () => {
    if (ended) return;
    trace(`mic start${hold ? " hold" : ""} (speaking=${window.speechSynthesis?.speaking}, ${navigator.userActivation?.isActive ? "in tap" : "no tap"})`);
    if (!hold) later(() => !lastInterim && !delivered && stop(), NO_SPEECH_MS);
    later(stop, hold ? MAX_HOLD_MS : MAX_LISTEN_MS);
    later(() => {
      // Before the mic first opened on this page, the permission prompt may be what's taking long.
      if (started || ended || !micEverStarted) return;
      cb.onError?.("no-start");
      try {
        rec.abort();
      } catch {
        // Never started.
      }
      finish();
    }, START_CONFIRM_MS);
    try {
      rec.start();
    } catch (err) {
      // A previous recognition still holding the mic: end cleanly so the learner can tap again.
      trace(`mic start threw ${(err as Error).message}`);
      cb.onError?.("no-start");
      finish();
    }
  };
  // A line that never got to play (iPhone blocks speech it didn't get from a tap) can sit in the queue
  // and keep the audio busy, so the mic records silence: clear it and give the audio a moment.
  const synth = ttsSupported ? window.speechSynthesis : null;
  const sinceSpeech = Date.now() - quietSince;
  const wasSpeaking = !!synth && (synth.speaking || synth.pending);
  if (wasSpeaking) synth.cancel();
  // The iPhone only opens the mic for a start() made inside the tap: delayed even 300 ms it silently never
  // starts, and since iOS can report speaking=true long after the voice stopped, every tap failed that way.
  if (isIOS) begin();
  else if (wasSpeaking) later(begin, AFTER_SPEECH_MS);
  else if (sinceSpeech < AFTER_SPEECH_MS) later(begin, AFTER_SPEECH_MS - sinceSpeech);
  else begin();
  return {
    stop,
    abort: () => {
      delivered = true;
      try {
        rec.abort();
      } catch {
        // Already stopped.
      }
      finish();
    },
  };
}
