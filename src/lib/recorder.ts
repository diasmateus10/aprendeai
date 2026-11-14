// Push-to-talk recording for the voice conversation: the raw microphone signal is captured while the orb is held
// and turned into 16 kHz mono WAV, the format Azure's speech recognition takes. Capturing PCM ourselves (instead of
// MediaRecorder) gives the same file on Chrome, Safari and the iPhone, whose recorders produce different formats.

/** Sample rate sent to the server: enough for speech, and the files stay small. */
export const TARGET_RATE = 16000;
/** Held shorter than this: a tap, not an answer. */
export const MIN_HOLD_MS = 250;
/** Longest answer; Azure's short-audio API takes up to 60 s. */
export const MAX_HOLD_MS = 45_000;
/** Kept recording after the release, so the last syllable isn't cut off. */
const TAIL_MS = 200;
/** Peak below this means the mic delivered silence (muted, or blocked by the iPhone's audio mode). */
const SILENT_PEAK = 0.01;

export interface Recording {
  /** 16 kHz mono 16-bit WAV, or null when the hold was too short or the mic recorded only silence. */
  wav: Blob | null;
  /** How long the orb was held. */
  ms: number;
  /** Why there is no audio ("opening": let go before the microphone had finished opening). */
  problem: "short" | "opening" | "silent" | null;
}

/** Linear-interpolation resample of mono samples to `to` Hz. */
export function resample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input;
  const out = new Float32Array(Math.max(1, Math.round((input.length * to) / from)));
  const step = from / to;
  for (let i = 0; i < out.length; i++) {
    const pos = i * step;
    const j = Math.floor(pos);
    const frac = pos - j;
    const a = input[j] ?? 0;
    const b = input[j + 1] ?? a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

/** Silence kept around the speech, so the first and last sounds aren't clipped. */
const TRIM_PAD_S = 0.25;

/**
 * Drops the quiet stretch before the learner starts and after they stop (holding the orb while thinking is
 * common): less to upload and less for the server to transcribe. Quiet means under a tenth of the loudest sound.
 */
export function trimSilence(samples: Float32Array, rate: number, peak: number): Float32Array {
  const threshold = Math.max(0.01, peak * 0.1);
  let first = 0;
  while (first < samples.length && Math.abs(samples[first]) < threshold) first++;
  let last = samples.length - 1;
  while (last > first && Math.abs(samples[last]) < threshold) last--;
  if (first >= samples.length) return samples;
  const pad = Math.round(TRIM_PAD_S * rate);
  return samples.subarray(Math.max(0, first - pad), Math.min(samples.length, last + 1 + pad));
}

/** 16-bit PCM WAV file for mono samples in [-1, 1]. */
export function encodeWav(samples: Float32Array, rate: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(44 + samples.length * 2));
  const v = new DataView(bytes.buffer);
  const tag = (o: number, s: string) => [...s].forEach((c, i) => (bytes[o + i] = c.charCodeAt(0)));
  tag(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  tag(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  tag(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return bytes;
}

export const canRecord =
  typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof AudioContext !== "undefined";

type Ctx = AudioContext;

/**
 * The microphone stays open for the whole conversation (opening it again for every answer is slow, and on the
 * iPhone it can fail outside a tap); samples are only kept while the orb is held.
 */
export class MicRecorder {
  private ctx: Ctx | null = null;
  private stream: MediaStream | null = null;
  private node: ScriptProcessorNode | null = null;
  private chunks: Float32Array[] = [];
  private recording = false;
  private startedAt = 0;
  private peak = 0;
  private opening: Promise<void> | null = null;
  /** Set by close(): a microphone that finishes opening afterwards is released at once. */
  private closed = false;
  /** Audio callbacks during the current hold, and the context's state when it began (shown with ?debug). */
  private callbacks = 0;
  private stateAtStart = "";
  /** Called with the input level (0..1) while recording, for the orb to pulse. */
  onLevel: ((level: number) => void) | null = null;

  /** What the mic delivered, for the ?debug log: tells a stopped audio context from a muted microphone. */
  diagnostics(): string {
    const track = this.stream?.getAudioTracks()[0];
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession?.type ?? "n/a";
    return (
      `ctx ${this.stateAtStart}->${this.ctx?.state ?? "none"} rate=${this.ctx?.sampleRate ?? 0}` +
      ` callbacks=${this.callbacks} peak=${this.peak.toFixed(4)}` +
      ` track=${track ? `${track.readyState}${track.muted ? " muted" : ""}${track.enabled ? "" : " disabled"} ${track.getSettings?.().sampleRate ?? "?"}Hz` : "none"}` +
      ` session=${session}`
    );
  }

  /** Starts keeping samples. Call it from the press itself: the iPhone only starts audio inside a tap. */
  start(): Promise<void> {
    this.chunks = [];
    this.peak = 0;
    this.callbacks = 0;
    this.startedAt = Date.now();
    this.recording = true;
    // Created and resumed synchronously, inside the tap.
    this.ctx ??= new AudioContext();
    this.stateAtStart = this.ctx.state;
    void this.ctx.resume();
    this.opening ??= this.open().catch((error) => {
      this.opening = null;
      this.recording = false;
      throw error;
    });
    return this.opening;
  }

  private async open() {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    // Closed while the iPhone was still opening it (or asking for permission): otherwise this microphone would
    // stay on with nothing listening, and the next recorder only heard silence.
    if (this.closed || !this.ctx) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.stream = stream;
    const ctx = this.ctx;
    const source = ctx.createMediaStreamSource(stream);
    // ScriptProcessor is deprecated but works everywhere, including the Safari versions without AudioWorklet modules.
    const node = ctx.createScriptProcessor(4096, 1, 1);
    node.onaudioprocess = (e) => {
      if (!this.recording) return;
      this.callbacks++;
      const data = new Float32Array(e.inputBuffer.getChannelData(0));
      let max = 0;
      for (let i = 0; i < data.length; i++) max = Math.max(max, Math.abs(data[i]));
      this.peak = Math.max(this.peak, max);
      this.chunks.push(data);
      this.onLevel?.(max);
    };
    source.connect(node);
    // Nothing is written to the output, so this plays silence; Chrome only runs the processor when it's connected.
    node.connect(ctx.destination);
    this.node = node;
  }

  get isRecording(): boolean {
    return this.recording;
  }

  /** Stops keeping samples and returns the answer. */
  async stop(): Promise<Recording> {
    const ms = Date.now() - this.startedAt;
    if (!this.recording) return { wav: null, ms, problem: "short" };
    if (ms >= MIN_HOLD_MS) await new Promise((r) => setTimeout(r, TAIL_MS));
    this.recording = false;
    this.onLevel?.(0);
    if (ms < MIN_HOLD_MS) return { wav: null, ms, problem: "short" };
    // Nothing was recorded because the microphone isn't open yet: that isn't silence, so it stays open for the next press.
    if (!this.node) return { wav: null, ms, problem: "opening" };
    if (this.peak < SILENT_PEAK) return { wav: null, ms, problem: "silent" };
    const total = this.chunks.reduce((n, c) => n + c.length, 0);
    const all = new Float32Array(total);
    let offset = 0;
    for (const c of this.chunks) {
      all.set(c, offset);
      offset += c.length;
    }
    this.chunks = [];
    const rate = this.ctx!.sampleRate;
    const pcm = resample(trimSilence(all, rate, this.peak), rate, TARGET_RATE);
    return { wav: new Blob([encodeWav(pcm, TARGET_RATE)], { type: "audio/wav" }), ms, problem: null };
  }

  /** Drops what is being recorded. */
  cancel() {
    this.recording = false;
    this.chunks = [];
    this.onLevel?.(0);
  }

  /** Releases the microphone (end of the conversation, or the tab went to the background). */
  close() {
    this.closed = true;
    this.cancel();
    this.node?.disconnect();
    this.node = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.opening = null;
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}

/** Base64 of a blob, for the JSON request. */
export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
