// The voice conversation's recorder (src/lib/recorder.ts) with a fake microphone: what happens when the learner
// lets go of the orb, or the conversation closes, before the microphone has finished opening (the iPhone takes
// over a second, longer while it asks for permission). Run with `npm run test:unit`.

import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { MicRecorder } from "../../src/lib/recorder";

class FakeTrack {
  readyState = "live";
  muted = false;
  enabled = true;
  stop() {
    this.readyState = "ended";
  }
  getSettings() {
    return { sampleRate: 48000 };
  }
}

class FakeStream {
  track = new FakeTrack();
  getTracks() {
    return [this.track];
  }
  getAudioTracks() {
    return [this.track];
  }
}

type Processor = { onaudioprocess: ((e: unknown) => void) | null; connect(): void; disconnect(): void };
let processor: Processor | null = null;

class FakeAudioContext {
  state = "suspended";
  sampleRate = 48000;
  destination = {};
  resume() {
    this.state = "running";
    return Promise.resolve();
  }
  close() {
    this.state = "closed";
    return Promise.resolve();
  }
  createMediaStreamSource() {
    return { connect() {} };
  }
  createScriptProcessor(): Processor {
    processor = { onaudioprocess: null, connect() {}, disconnect() {} };
    return processor;
  }
}

/** getUserMedia that answers only when the test says so, like a slow iPhone or a permission prompt. */
let grant: (stream: FakeStream) => void = () => {};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** One ScriptProcessor callback carrying `level` on every sample. */
const sound = (level: number) => ({ inputBuffer: { getChannelData: () => new Float32Array(4096).fill(level) } });

beforeEach(() => {
  processor = null;
  Object.defineProperty(globalThis.navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: () => new Promise<FakeStream>((resolve) => (grant = resolve)) },
  });
  (globalThis as Record<string, unknown>).AudioContext = FakeAudioContext;
});

describe("gravador da conversa", () => {
  test("microfone aberto e voz: grava um WAV", async () => {
    const rec = new MicRecorder();
    const opened = rec.start();
    grant(new FakeStream());
    await opened;
    await sleep(300);
    processor!.onaudioprocess!(sound(0.3));
    const out = await rec.stop();
    assert.equal(out.problem, null);
    assert.ok(out.wav && out.wav.size > 44);
  });

  test("soltar antes do microfone abrir não conta como silêncio, e o microfone continua abrindo", async () => {
    const rec = new MicRecorder();
    const opened = rec.start();
    await sleep(300);
    const out = await rec.stop();
    assert.equal(out.problem, "opening");
    // The mic finishes opening afterwards and is ready for the next press.
    const stream = new FakeStream();
    grant(stream);
    await opened;
    assert.equal(stream.track.readyState, "live");
    rec.start();
    await sleep(300);
    processor!.onaudioprocess!(sound(0.3));
    assert.equal((await rec.stop()).problem, null);
  });

  test("fechar antes do microfone abrir desliga o microfone que chega depois, sem erro", async () => {
    const rec = new MicRecorder();
    const opened = rec.start();
    rec.close();
    const stream = new FakeStream();
    grant(stream);
    await assert.doesNotReject(opened);
    assert.equal(stream.track.readyState, "ended");
  });
});
