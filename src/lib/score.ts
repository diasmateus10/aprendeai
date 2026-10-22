// Compares what the learner said or typed against the expected English sentence.

const CONTRACTIONS: Record<string, string> = {
  "i'm": "i am",
  "you're": "you are",
  "it's": "it is",
  "that's": "that is",
  "what's": "what is",
  "don't": "do not",
  "doesn't": "does not",
  "can't": "cannot",
  "i'd": "i would",
  "let's": "let us",
  "isn't": "is not",
  "where's": "where is",
};

export function normalize(text: string): string[] {
  let t = text.toLowerCase().replace(/[’`]/g, "'");
  for (const [k, v] of Object.entries(CONTRACTIONS)) {
    t = t.replace(new RegExp(`\\b${k}\\b`, "g"), v);
  }
  return t
    .replace(/can not/g, "cannot")
    .replace(/[^a-z0-9' ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
}

export interface WordResult {
  word: string;
  ok: boolean;
}

export interface Score {
  /** 0..1 share of expected words that were matched, in order. */
  accuracy: number;
  words: WordResult[];
  heard: string;
}

/** Aligns heard words to the expected words (LCS) so each expected word is marked hit or missed. */
function scoreOne(expected: string, heard: string, tolerant: boolean): Score {
  const exp = normalize(expected);
  const got = normalize(heard);
  const same = (x: string, y: string) =>
    x === y || (tolerant && x.length > 3 && editDistance(x, y) <= 1);

  const n = exp.length;
  const m = got.length;
  const lcs = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = same(exp[i], got[j]) ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const hit = new Set<number>();
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (same(exp[i], got[j])) {
      hit.add(i);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) i++;
    else j++;
  }
  const display = expected.split(/\s+/);
  // Display words map 1:1 to normalized words except where contractions expand; fall back to ratio.
  const words =
    display.length === n
      ? display.map((w, k) => ({ word: w, ok: hit.has(k) }))
      : display.map((w) => ({ word: w, ok: hit.size / Math.max(n, 1) >= 0.8 }));
  return { accuracy: n ? hit.size / n : 0, words, heard };
}

export function scoreSpeech(expected: string, alternatives: string[]): Score {
  if (alternatives.length === 0) return scoreOne(expected, "", true);
  return alternatives
    .map((alt) => scoreOne(expected, alt, true))
    .reduce((best, s) => (s.accuracy > best.accuracy ? s : best));
}

export function scoreTyped(expected: string, typed: string): Score {
  return scoreOne(expected, typed, true);
}

/** Speaking passes at 80%; dictation must be essentially exact (one typo per long word tolerated). */
export const SPEAK_PASS = 0.8;
export const TYPE_PASS = 1;
