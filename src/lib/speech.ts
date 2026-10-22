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

function pickVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice) return cachedVoice;
  const voices = englishVoices();
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

export function speak(text: string, slow = false): Promise<void> {
  return new Promise((resolve) => {
    if (!ttsSupported) return resolve();
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voice = pickVoice();
    if (voice) u.voice = voice;
    u.lang = voice?.lang ?? accent;
    // Neural voices sound most natural at their normal speed; slowing them down is what "🐢" is for.
    u.rate = slow ? 0.6 : 1;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  });
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
  stop(): void;
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
    return { stop() {} };
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
  return { stop: () => rec.stop() };
}
