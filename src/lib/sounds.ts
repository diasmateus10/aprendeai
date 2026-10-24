// Feedback sounds (right, wrong, finished), synthesized with the Web Audio API: no files to download.

type Ctx = AudioContext;
let ctx: Ctx | null = null;

type SessionType = "auto" | "playback";
type AudioSessionNav = Navigator & { audioSession?: { type: string } };

/** iOS (Safari 17+): "playback" makes sounds play even with the silent switch on; "auto" lets the mic work. */
export function setAudioSession(type: SessionType) {
  const session = typeof navigator === "undefined" ? undefined : (navigator as AudioSessionNav).audioSession;
  if (!session || session.type === type) return;
  try {
    session.type = type;
  } catch {
    // Older browsers: sounds follow the silent switch.
  }
}

function audio(): Ctx | null {
  if (typeof window === "undefined") return null;
  setAudioSession("playback");
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

// Browsers (iOS above all) only start audio from a tap; answers spoken into the mic arrive later, so the
// context is woken up on the first tap and stays running.
if (typeof window !== "undefined") {
  const events = ["click", "touchend", "keydown"] as const;
  const wake = () => {
    const c = audio();
    if (c?.state === "running") events.forEach((e) => window.removeEventListener(e, wake, true));
  };
  events.forEach((e) => window.addEventListener(e, wake, true));
}

/** One soft note: quick attack, smooth decay. */
function note(c: Ctx, freq: number, at: number, length: number, volume = 0.16, type: OscillatorType = "triangle") {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(gain).connect(c.destination);
  osc.start(at);
  osc.stop(at + length + 0.02);
}

/** Right answer: a bright rising two-note chime. */
export function playCorrect() {
  const c = audio();
  if (!c) return;
  const t = c.currentTime + 0.01;
  note(c, 880, t, 0.16);
  note(c, 1318.5, t + 0.09, 0.28);
}

/** Wrong answer: a low, short, gentle tone (not a buzzer). */
export function playWrong() {
  const c = audio();
  if (!c) return;
  const t = c.currentTime + 0.01;
  note(c, 311, t, 0.18, 0.12, "sine");
  note(c, 233, t + 0.12, 0.3, 0.12, "sine");
}

/** End of a lesson or session: a short celebratory arpeggio. */
export function playComplete() {
  const c = audio();
  if (!c) return;
  const t = c.currentTime + 0.01;
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => note(c, f, t + i * 0.09, i === 3 ? 0.45 : 0.18, 0.14));
}
