// Feedback sounds (right, wrong, finished), synthesized in code as small WAV files: no files to download.
// They play through an <audio> element rather than the Web Audio API because iOS treats media elements as
// media (they play with the silent switch on), while Web Audio follows the switch.

import { playEffect } from "./speech";

type Wave = "triangle" | "sine";
type Note = { freq: number; at: number; length: number; volume: number; wave: Wave };

const RATE = 22050;

/** Renders notes (quick attack, smooth decay) into a 16-bit mono WAV. */
function render(notes: Note[]): Blob {
  const seconds = Math.max(...notes.map((n) => n.at + n.length)) + 0.03;
  const samples = new Float32Array(Math.ceil(seconds * RATE));
  for (const n of notes) {
    const start = Math.floor(n.at * RATE);
    const total = Math.floor(n.length * RATE);
    const attack = Math.floor(0.015 * RATE);
    for (let i = 0; i < total && start + i < samples.length; i++) {
      const phase = (i * n.freq) / RATE;
      const x = phase - Math.floor(phase);
      const v = n.wave === "sine" ? Math.sin(2 * Math.PI * x) : 1 - 4 * Math.abs(x - 0.5);
      const env = i < attack ? i / attack : Math.exp((-6 * (i - attack)) / (total - attack));
      samples[start + i] += v * env * n.volume;
    }
  }
  const data = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const text = (at: number, s: string) => [...s].forEach((c, i) => data.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF");
  data.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVEfmt ");
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true);
  data.setUint16(22, 1, true);
  data.setUint32(24, RATE, true);
  data.setUint32(28, RATE * 2, true);
  data.setUint16(32, 2, true);
  data.setUint16(34, 16, true);
  text(36, "data");
  data.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => data.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true));
  return new Blob([data], { type: "audio/wav" });
}

const note = (freq: number, at: number, length: number, volume = 0.5, wave: Wave = "triangle"): Note => ({ freq, at, length, volume, wave });

const SOUNDS = {
  // Right answer: a bright rising two-note chime.
  correct: [note(880, 0, 0.16), note(1318.5, 0.09, 0.28)],
  // Wrong answer: a low, short, gentle tone (not a buzzer).
  wrong: [note(311, 0, 0.18, 0.45, "sine"), note(233, 0.12, 0.3, 0.45, "sine")],
  // End of a lesson or session: a short celebratory arpeggio.
  complete: [523.25, 659.25, 783.99, 1046.5].map((f, i) => note(f, i * 0.09, i === 3 ? 0.45 : 0.18, 0.42)),
};
type Sound = keyof typeof SOUNDS;

const urls: Partial<Record<Sound, string>> = {};

// They share the speech module's <audio> element: iOS plays one media element at a time and only lets an
// element play from code once it has played during a tap, which that module takes care of.
function play(sound: Sound) {
  if (typeof URL === "undefined") return;
  playEffect((urls[sound] ??= URL.createObjectURL(render(SOUNDS[sound]))));
}

export const playCorrect = () => play("correct");
export const playWrong = () => play("wrong");
export const playComplete = () => play("complete");
