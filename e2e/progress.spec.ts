// Going forward in the course: lessons, hearts, microphone, flashcards, the free plan's limit, saved progress.

import type { Page } from "@playwright/test";
import { expect, learner, test } from "./support/fixtures";
import { micError } from "./support/fakes";
import { answerExercise, answerFlashcard, playLesson } from "./support/student";

/** Waits for the home and, when the day's flashcards come first, goes straight to the lesson card. */
async function skipFlashcards(page: Page) {
  const skip = page.getByRole("button", { name: "Ir direto para a lição", exact: true });
  const lesson = page.getByRole("button", { name: /Começar lição|Liberar no Premium/ });
  await expect(skip.or(lesson).first()).toBeVisible();
  if (await skip.isVisible()) await skip.click();
}

/** From the home, skips the day's flashcards (when offered) and opens the current lesson. */
async function startCurrentLesson(page: Page) {
  await skipFlashcards(page);
  await page.getByRole("button", { name: "Começar lição", exact: true }).click();
  await expect(page.locator(".lesson-body")).toBeVisible();
}

test("completa a Unidade 1 inteira (Ouvir, Falar, Conversar) e esbarra no limite do plano grátis", async ({ page, backend }) => {
  test.slow(); // three whole lessons
  backend.progress = learner();
  await page.goto("/");
  await expect(page.getByText("Sua trilha")).toBeVisible();

  const kinds = new Set<string>();
  for (const [i, title] of ["Ouvir", "Falar", "Conversar"].entries()) {
    await skipFlashcards(page);
    await expect(page.locator(".continue-card h1").last()).toContainText(title);
    await startCurrentLesson(page);
    (await playLesson(page)).forEach((k) => kinds.add(k));

    await expect(page.getByRole("heading", { name: /Boa! Você falou|Lição feita!/ })).toBeVisible();
    await expect(page.locator(".stats")).toContainText("XP");
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await expect(page.getByText("Sua trilha")).toBeVisible();
    // Saved in the account, with three stars for a perfect lesson.
    await expect.poll(() => Object.keys((backend.progress?.completed as object) ?? {}).length).toBe(i + 1);
  }

  // Every kind of exercise was answered along the way.
  expect([...kinds].sort()).toEqual(["dictation", "listen_choose", "minimal_pair", "repeat", "respond", "speak_translate"]);
  expect(Object.values(backend.progress!.completed as Record<string, number>)).toEqual([3, 3, 3]);
  expect(backend.progress!.xp).toBeGreaterThan(30);
  expect(backend.progress!.streak).toBe(1);

  // Unit 2 is Premium on the free plan.
  await skipFlashcards(page);
  await expect(page.getByRole("button", { name: /Liberar no Premium/ })).toBeVisible();
  await page.getByRole("button", { name: /Liberar no Premium/ }).click();
  await expect(page.getByText(/A Unidade 2 faz parte do Premium/)).toBeVisible();
});

test("assinante Premium segue para a Unidade 2", async ({ page, backend }) => {
  backend.makePremium();
  backend.progress = learner({ completed: { "hello-escuta": 3, "hello-fala": 3, "hello-conversa": 3 } });
  await page.goto("/");
  await skipFlashcards(page);
  await expect(page.locator(".continue-card")).toContainText("Unidade 02");
  await expect(page.getByRole("button", { name: "Começar lição", exact: true })).toBeVisible();
});

test("errar tudo gasta as 5 vidas e a lição termina em “Quase lá”, sem salvar progresso", async ({ page, backend }) => {
  backend.progress = learner();
  await page.goto("/");
  await startCurrentLesson(page);
  for (let hearts = 5; hearts > 0; hearts--) {
    await expect(page.locator(".hearts")).toHaveAccessibleName(`${hearts} vidas`);
    await answerExercise(page, { correct: false });
    await page.locator("footer.feedback").getByRole("button", { name: "Continuar", exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: "Quase lá." })).toBeVisible();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  expect(backend.progress!.completed ?? {}).toEqual({});
});

test("“Não posso falar agora” troca os exercícios de fala por escrita, sem perder vida", async ({ page, backend }) => {
  backend.progress = learner({ completed: { "hello-escuta": 3 } });
  await page.goto("/");
  await startCurrentLesson(page);
  // The "Falar" lesson opens with speaking.
  await expect(page.locator(".exercise h2")).toHaveText("Ouça e repita em voz alta");
  await page.getByRole("button", { name: "Não posso falar agora", exact: true }).click();
  await expect(page.locator("footer.feedback")).toContainText("os exercícios de fala viram escrita");
  await expect(page.locator(".hearts")).toHaveAccessibleName("5 vidas");
  await page.locator("footer.feedback").getByRole("button", { name: "Continuar", exact: true }).click();

  // From here on, nothing asks for the microphone.
  const kinds = await playLesson(page);
  expect(kinds.filter((k) => k === "repeat" || k === "speak_translate" || k === "respond")).toEqual([]);
  await expect(page.getByRole("heading", { name: /Lição feita!|Boa!/ })).toBeVisible();
});

test("microfone bloqueado explica como liberar", async ({ page, backend }) => {
  backend.progress = learner({ completed: { "hello-escuta": 3 } });
  await page.goto("/");
  await startCurrentLesson(page);
  await micError(page, "not-allowed");
  await page.locator(".mic-panel").getByRole("button", { name: "Falar", exact: true }).click();
  await expect(page.locator(".mic-panel .warn")).toContainText("O microfone está bloqueado");
  await expect(page.locator(".hearts")).toHaveAccessibleName("5 vidas");
});

test("silêncio no microfone pede para tentar de novo, sem tirar vida", async ({ page, backend }) => {
  backend.progress = learner({ completed: { "hello-escuta": 3 } });
  await page.goto("/");
  await startCurrentLesson(page);
  await page.locator(".mic-panel").getByRole("button", { name: "Falar", exact: true }).click();
  await expect(page.locator(".mic-panel .warn")).toContainText("Não ouvi nada");
  await expect(page.locator(".hearts")).toHaveAccessibleName("5 vidas");
});

test("flashcards do dia: acerta digitando e falando, e ganha XP", async ({ page, backend }) => {
  backend.progress = learner();
  await page.goto("/");
  await page.getByRole("button", { name: "Começar flashcards", exact: true }).click();

  const typed = await answerFlashcard(page);
  if (typed) await expect(page.locator(".picture-ok")).toContainText("de primeira");
  await page.getByRole("button", { name: "Próximo", exact: true }).click();

  const said = await answerFlashcard(page, { byVoice: true });
  if (said) await expect(page.locator(".picture-ok")).toBeVisible();
  await page.getByRole("button", { name: "Próximo", exact: true }).click();

  await expect.poll(() => Object.keys((backend.progress?.cards as object) ?? {}).length).toBeGreaterThanOrEqual(2);
  if (typed || said) expect(backend.progress!.xp).toBeGreaterThan(0);
});

test("o progresso volta depois de recarregar o app", async ({ page, backend }) => {
  backend.progress = learner();
  await page.goto("/");
  await startCurrentLesson(page);
  await playLesson(page);
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect.poll(() => (backend.progress?.completed as Record<string, number> | undefined)?.["hello-escuta"]).toBe(3);

  await page.reload();
  await skipFlashcards(page);
  await expect(page.locator(".continue-card h1").last()).toContainText("Falar");
});

test("fechar o app logo depois da lição não perde o progresso", async ({ page, backend }) => {
  backend.progress = learner();
  await page.goto("/");
  await startCurrentLesson(page);
  await playLesson(page);
  // Right away, before the account upload (it waits 1.5 s for more changes).
  await page.reload();
  await skipFlashcards(page);
  await expect(page.locator(".continue-card h1").last()).toContainText("Falar");
});
