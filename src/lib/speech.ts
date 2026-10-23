// Text-to-speech (escuta) and speech recognition (fala) via the Web Speech API.

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
  if (/\b(david|zira|mark|hazel|george|espeak|fred|albert|ralph|kathy|junior|zarvox|trinoids|whisper|bells|boing|bubbles|cellos|organ|jester|superstar|wobble|bahh|princess)\b/.test(n)) s -= 100;
  if (norm(v.lang) === accent.toLowerCase()) s += 20;
  return s;
}

/** English voices this device offers, most natural first (current accent ranked higher). */
export function englishVoices(): SpeechSynthesisVoice[] {
  const voices = typeof window !== "undefined" ? window.speechSynthesis?.getVoices() ?? [] : [];
  return voices.filter((v) => norm(v.lang).startsWith("en")).sort((a, b) => voiceScore(b) - voiceScore(a));
}

/** True for voices that typically sound natural, to label them in the picker. */
export function isNaturalVoice(v: SpeechSynthesisVoice): boolean {
  return voiceScore(v) >= 60;
}

/** Voices that failed to synthesize (Edge's online "Natural" voices do when offline); skipped from then on. */
const brokenVoices = new Set<string>();

function pickVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice) return cachedVoice;
  const voices = englishVoices().filter((v) => !brokenVoices.has(v.name));
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

// iOS only lets speech start from a tap; replies arrive after a fetch, so unlock it on the first one.
if (ttsSupported) {
  const events = ["click", "touchend", "keydown"] as const;
  const unlock = () => {
    events.forEach((e) => window.removeEventListener(e, unlock, true));
    if (window.speechSynthesis.speaking) return;
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
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

/** Speaks the text; resolves when it finishes, fails or is interrupted by another speak()/cancel(). */
export function speak(text: string, slow = false): Promise<void> {
  const id = ++speakId;
  return new Promise((resolve) => {
    const parts = chunk(text);
    if (!ttsSupported || parts.length === 0) return resolve();
    const synth = window.speechSynthesis;
    const interrupting = synth.speaking || synth.pending;
    synth.cancel();

    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    // Safety net: some engines never fire onend, which would stall the hands-free conversation.
    const timer = setTimeout(done, 4000 + text.length * (slow ? 150 : 90));

    let attempt = 0;
    const run = (retried: boolean) => {
      const mine = ++attempt;
      if (id !== speakId) return done();
      const voice = pickVoice();
      // Chrome can be left paused (e.g. after the tab was in the background) and then stays silent.
      synth.resume();
      queue = parts.map((p, i) => {
        const u = new SpeechSynthesisUtterance(p);
        if (voice) u.voice = voice;
        u.lang = voice?.lang ?? accent;
        // Neural voices sound most natural at their normal speed; slowing them down is what "🐢" is for.
        u.rate = slow ? 0.6 : 1;
        if (i === parts.length - 1) u.onend = () => mine === attempt && done();
        u.onerror = (e) => {
          if (mine !== attempt) return;
          if (e.error === "interrupted" || e.error === "canceled" || retried || !voice) return done();
          // The voice itself failed: drop it and retry with the next best one.
          brokenVoices.add(voice.name);
          cachedVoice = null;
          synth.cancel();
          run(true);
        };
        return u;
      });
      queue.forEach((u) => synth.speak(u));
    };
    // Chrome sometimes drops a speak() issued right after cancel(), so give it a moment when interrupting.
    if (interrupting) setTimeout(() => run(false), 80);
    else run(false);
  });
}

export function stopSpeaking() {
  speakId++;
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

export interface ListenCallbacks {
  onInterim?(text: string): void;
  onFinal(alternatives: string[]): void;
  onError?(error: string): void;
  onEnd?(): void;
}

/** Listens for one English utterance and reports all recognition alternatives. */
export function listen(cb: ListenCallbacks): ListenHandle {
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
  rec.continuous = false;
  let delivered = false;
  rec.onresult = (e) => {
    const result = e.results[e.results.length - 1];
    if (result.isFinal) {
      const alts: string[] = [];
      for (let i = 0; i < result.length; i++) alts.push(result[i].transcript);
      delivered = true;
      cb.onFinal(alts);
    } else {
      cb.onInterim?.(result[0].transcript);
    }
  };
  rec.onerror = (e) => cb.onError?.(e.error);
  rec.onend = () => {
    if (!delivered) cb.onFinal([]);
    cb.onEnd?.();
  };
  rec.start();
  return { stop: () => rec.stop(), abort: () => rec.abort() };
}
