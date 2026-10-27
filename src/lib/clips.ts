// Recorded voice for the course's fixed content: every phrase and word the app says was generated once
// with Kokoro (open model, Apache-2.0) by scripts/course-audio.ts and is served from /audio. speak() plays
// these files when they exist and falls back to the device voice for anything else (the AI's replies).

/** Text as the clips were made from it: same words, same spacing, case and punctuation kept (they change the reading). */
export function clipText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Stable short id for a text (two 32-bit FNV-1a hashes), used as the file name. */
export function clipKey(text: string): string {
  const s = clipText(text);
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x5bd1e995);
  }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}

/** Voice folder per accent. */
export const CLIP_VOICES = { "en-US": "us", "en-GB": "uk" } as const;
