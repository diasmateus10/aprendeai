// A robot learner: reads the exercise on screen and answers it the way a person would (listening to the
// audio, typing, speaking into the microphone), right or wrong on purpose.

import { expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { units, type Unit } from "../../src/data/course";
import { clearSpoken, spoken, willSay } from "./fakes";

// JSON is loaded with require: Node's ESM wants import attributes the app's code doesn't use.
const require = createRequire(import.meta.url);
const themeUnits = require("../../src/data/theme-units.json") as Record<string, Unit[]>;
const photos = require("../../src/data/photos.json") as Record<string, { file: string }>;

/** English phrase → its Portuguese translations, for "O que você ouviu?". */
const TRANSLATIONS = new Map<string, Set<string>>();
for (const p of [...units, ...Object.values(themeUnits).flat()].flatMap((u) => u.phrases)) {
  if (!TRANSLATIONS.has(p.en)) TRANSLATIONS.set(p.en, new Set());
  TRANSLATIONS.get(p.en)!.add(p.pt);
}

/** Flashcard photo file → the English word it shows. */
const PHOTO_WORDS = new Map(Object.entries(photos).map(([word, p]) => [p.file, word]));

/** Plays the exercise's audio and returns the English the app said. */
async function hear(page: Page): Promise<string> {
  await clearSpoken(page);
  await page.locator(".exercise .sound-play").first().click();
  await expect.poll(async () => (await spoken(page)).length, { message: "the app should speak the audio" }).toBeGreaterThan(0);
  return (await spoken(page)).at(-1)!;
}

const WRONG_SPEECH = "banana pajamas helicopter";

export type ExerciseKind = "listen_choose" | "minimal_pair" | "dictation" | "repeat" | "speak_translate" | "respond";

/** Answers the exercise on screen. Returns its kind. */
export async function answerExercise(page: Page, { correct = true } = {}): Promise<ExerciseKind> {
  const title = (await page.locator(".exercise h2").first().innerText()).trim();
  const check = page.getByRole("button", { name: "Verificar", exact: true });

  if (title === "O que você ouviu?") {
    const audio = await hear(page);
    const right = TRANSLATIONS.get(audio) ?? new Set();
    const options = page.locator(".exercise .option");
    const texts = await options.allInnerTexts();
    const i = texts.findIndex((t) => right.has(t.trim()) === correct);
    expect(i, `option for "${audio}" in ${JSON.stringify(texts)}`).toBeGreaterThanOrEqual(0);
    await options.nth(i).click();
    await check.click();
    return "listen_choose";
  }

  if (title === "Qual palavra você ouviu?") {
    const word = await hear(page);
    const options = page.locator(".exercise .option.pair");
    const words = (await options.locator("strong").allInnerTexts()).map((w) => w.trim());
    const i = words.findIndex((w) => (w === word) === correct);
    expect(i, `pair option for "${word}" in ${JSON.stringify(words)}`).toBeGreaterThanOrEqual(0);
    await options.nth(i).click();
    await check.click();
    return "minimal_pair";
  }

  if (title === "Escreva o que você ouviu") {
    const phrase = await hear(page);
    await page.locator("textarea.dictation").fill(correct ? phrase : "zzz qqq");
    await check.click();
    if (!correct) {
      // Second try: the blanks.
      for (const blank of await page.locator(".fill-input").all()) await blank.fill("zzz");
      await check.click();
    }
    return "dictation";
  }

  // Speaking exercises: find the target sentence on screen, then "say" it.
  let target: string;
  let kind: ExerciseKind;
  if (title === "Ouça e repita em voz alta") {
    kind = "repeat";
    target = await page.locator(".exercise .target-en").innerText();
  } else if (title === "Diga em inglês") {
    kind = "speak_translate";
    await page.getByRole("button", { name: "Mostrar dica", exact: true }).click();
    target = await page.locator(".exercise .reveal .target-pt").innerText();
  } else if (title === "Responda em voz alta") {
    kind = "respond";
    await page.getByRole("button", { name: "Ver exemplo de resposta", exact: true }).click();
    target = await page.locator(".exercise .tip strong").innerText();
  } else if (title === "Quase! Complete só o que faltou") {
    throw new Error("dictation second try reached unexpectedly");
  } else {
    throw new Error(`Unknown exercise: "${title}"`);
  }

  const tries = correct ? 1 : 3;
  for (let t = 0; t < tries; t++) {
    await willSay(page, correct ? target : WRONG_SPEECH);
    await page.locator(".mic-panel").getByRole("button", { name: "Falar", exact: true }).click();
    // Wait for the recognition to finish before the next try.
    await expect(page.locator(".mic-panel").getByRole("button", { name: "Falar", exact: true })).toBeVisible();
  }
  return kind;
}

/** Answers until the lesson ends. Returns the kinds of exercises seen. */
export async function playLesson(page: Page, { correct = true } = {}): Promise<ExerciseKind[]> {
  const seen: ExerciseKind[] = [];
  const result = page.locator(".center-screen h1, .center h1").first();
  for (let step = 0; step < 40; step++) {
    // Each answer is followed by the feedback bar's "Continuar".
    seen.push(await answerExercise(page, { correct }));
    const next = page.locator("footer.feedback").getByRole("button", { name: "Continuar", exact: true });
    await expect(next).toBeVisible();
    await next.click();
    if (await page.locator(".lesson-body").count() === 0) return seen;
  }
  throw new Error(`Lesson did not end (last screen: ${await result.innerText().catch(() => "?")})`);
}

/** Says the right word on a flashcard (typing it, or speaking with `byVoice`). */
export async function answerFlashcard(page: Page, { byVoice = false } = {}) {
  const src = (await page.locator(".picture-photo img").getAttribute("src")) ?? "";
  const word = PHOTO_WORDS.get(src.replace("/photos/", ""));
  if (!word) {
    // Illustration without a photo: reveal it.
    await page.getByRole("button", { name: "Não sei", exact: true }).click();
    return null;
  }
  if (byVoice) {
    await willSay(page, word);
    await page.locator(".card-mic").getByRole("button", { name: "Falar", exact: true }).click();
  } else {
    await page.getByLabel("A palavra em inglês").fill(word);
    await page.getByRole("button", { name: "OK", exact: true }).click();
  }
  return word;
}
