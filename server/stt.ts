// Speech-to-text through Azure AI Speech (short-audio REST API), used by the voice conversation.
// The app records the learner's answer itself and sends 16 kHz mono WAV: one request per answer, at most 60 s.
// Same key and region as the voice (AZURE_SPEECH_KEY, AZURE_SPEECH_REGION); the free F0 tier covers 5 hours a month.

export interface Transcript {
  /** What the learner said, punctuated; "" when nothing was understood. */
  text: string;
  /** Recognizer confidence, 0..1. */
  confidence: number;
  /** Language it was recognized in: the learner's English accent, or Portuguese when they got stuck. */
  lang: string;
}

/** Azure answered that this key can't transcribe now (wrong key, monthly free quota used up, too many at once). */
export class SttUnavailable extends Error {
  constructor(readonly status: number) {
    super(`Azure STT ${status}`);
  }
}

interface AzureResult {
  RecognitionStatus: string;
  DisplayText?: string;
  NBest?: { Confidence: number; Display: string }[];
}

/** Below this, an English result is probably the learner speaking Portuguese (or noise): try Portuguese too. */
const LOW_CONFIDENCE = 0.5;

async function recognize(wav: Buffer, lang: string, key: string, region: string): Promise<Transcript> {
  const url =
    `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1` +
    `?language=${lang}&format=detailed&profanity=raw`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
      Accept: "application/json",
      "User-Agent": "aprendeai",
    },
    body: new Uint8Array(wav),
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 401 || res.status === 403 || res.status === 429) {
    console.error(`[stt] Azure ${res.status}:`, await res.text().catch(() => ""));
    throw new SttUnavailable(res.status);
  }
  if (!res.ok) throw new Error(`Azure STT ${res.status}: ${await res.text().catch(() => "")}`);
  const data = (await res.json()) as AzureResult;
  if (data.RecognitionStatus !== "Success") return { text: "", confidence: 0, lang };
  const best = data.NBest?.[0];
  return { text: (best?.Display ?? data.DisplayText ?? "").trim(), confidence: best?.Confidence ?? 0, lang };
}

/**
 * Transcribes one answer in the learner's English accent. When that comes back empty or unsure, the same
 * audio is tried in Portuguese: beginners who get stuck say it in Portuguese, and the partner helps them.
 */
export async function transcribe(wav: Buffer, accent: string, key: string, region: string): Promise<Transcript> {
  const english = await recognize(wav, accent, key, region);
  if (english.text && english.confidence >= LOW_CONFIDENCE) return english;
  const portuguese = await recognize(wav, "pt-BR", key, region);
  return portuguese.confidence > english.confidence ? portuguese : english;
}
