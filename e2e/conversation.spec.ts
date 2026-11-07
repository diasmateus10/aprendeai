// Talking with the AI: voice (push-to-talk orb) and keyboard, corrections, feedback, errors and the free limit.

import type { Page } from "@playwright/test";
import { expect, learner, test } from "./support/fixtures";
import { AI_LINES, spoken, willSay } from "./support/fakes";

async function openCafe(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /Conversa com IA|Conversar com a IA|Conversa/ }).first().click();
  await expect(page.getByRole("heading", { name: "Conversa com IA" })).toBeVisible();
  await page.locator(".topic", { hasText: "No café" }).click();
}

/** Holds the orb while "saying" the line, then lets go (push-to-talk). */
async function holdOrbAndSay(page: Page, line: string) {
  const orb = page.locator("button.orb");
  await expect(orb).toBeEnabled();
  await willSay(page, line);
  await orb.focus();
  await page.keyboard.down("Space");
  await expect(page.locator(".msg.me.interim")).toHaveText(line);
  await page.keyboard.up("Space");
}

test("conversa no café: a IA abre, o aluno fala e digita, recebe correção e feedback, e ganha XP", async ({ page, backend, ai }) => {
  backend.progress = learner({ level: "basico" });
  await openCafe(page);

  // The partner opens the scenario and its line is spoken.
  await expect(page.locator(".msg.ai").first()).toContainText(AI_LINES.opening);
  await expect.poll(async () => (await spoken(page)).join(" ")).toContain("Welcome to Bean Street Café");
  expect(ai.chatTurns[0]).toMatchObject({ topic: "cafe", level: "basico", mode: "chat", messages: [] });

  // Voice answer.
  await holdOrbAndSay(page, "i want coffee");
  await expect(page.locator(".msg.me").first()).toHaveText("i want coffee");
  await expect(page.locator(".msg.ai").nth(1)).toContainText("Do you want it hot or iced?");
  // The Portuguese correction shows apart and is not read aloud.
  await expect(page.locator(".msg-tip")).toContainText("💡 Dica");
  expect((await spoken(page)).join(" ")).not.toContain("Dica");
  expect(ai.chatTurns[1].messages.at(-1)).toEqual({ role: "user", content: "i want coffee" });

  // Keyboard answer.
  await page.getByRole("button", { name: "Digitar", exact: true }).click();
  await page.getByLabel("Sua resposta em inglês").fill("Iced, please");
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.locator(".msg.ai").nth(2)).toContainText(AI_LINES.third);
  expect(ai.chatTurns[2].messages.map((m) => m.role)).toEqual(["assistant", "user", "assistant", "user"]);

  // Ending asks for the feedback with the whole conversation.
  await page.getByRole("button", { name: "Encerrar", exact: true }).click();
  await expect(page.locator(".feedback-card")).toContainText("Pontos fortes:");
  await expect(page.locator(".feedback-card")).toContainText("i want coffee → I would like a coffee");
  const feedback = ai.requests.find((r) => r.mode === "feedback")!;
  expect(feedback.messages.filter((m) => m.role === "user")).toHaveLength(2);
  expect(feedback.sessionId).toBe(ai.chatTurns[0].sessionId);

  await page.getByRole("button", { name: "Concluir", exact: true }).click();
  await expect(page.getByText("Sua trilha")).toBeVisible();
  // 2 XP per sentence spoken.
  await expect.poll(() => backend.progress?.xp).toBe(4);
});

test("“Traduzir” mostra a fala da IA em português, e esconde de novo sem pedir outra vez", async ({ page, backend, ai }) => {
  backend.progress = learner({ level: "basico" });
  await openCafe(page);
  const opening = page.locator(".msg.ai").first();
  await expect(opening).toContainText(AI_LINES.opening);

  await opening.getByRole("button", { name: "Traduzir para português" }).click();
  await expect(opening.locator(".msg-pt")).toHaveText(AI_LINES.openingPt);
  const asked = ai.requests.filter((r) => r.mode === "translate");
  expect(asked).toHaveLength(1);
  expect(asked[0].messages).toEqual([{ role: "user", content: AI_LINES.opening }]);
  // The translation is read, never spoken.
  expect((await spoken(page)).join(" ")).not.toContain("Bem-vindo");

  await opening.getByRole("button", { name: "Esconder tradução" }).click();
  await expect(opening.locator(".msg-pt")).toHaveCount(0);
  await opening.getByRole("button", { name: "Traduzir para português" }).click();
  await expect(opening.locator(".msg-pt")).toHaveText(AI_LINES.openingPt);
  expect(ai.requests.filter((r) => r.mode === "translate")).toHaveLength(1);
});

test("soltar a bolinha rápido demais explica como falar", async ({ page, backend }) => {
  backend.progress = learner();
  await openCafe(page);
  await expect(page.locator(".msg.ai").first()).toBeVisible();
  const orb = page.locator("button.orb");
  await expect(orb).toBeEnabled();
  // A tap lasts no time at all: the page's clock stands still from press to release, so the result doesn't
  // depend on how slow the machine running the test is.
  await page.evaluate(() => {
    const now = Date.now();
    (window as unknown as { __realNow: () => number }).__realNow = Date.now;
    Date.now = () => now;
  });
  await orb.evaluate((el) => el.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true })));
  await expect(orb).toHaveClass(/live/);
  await orb.evaluate((el) => el.dispatchEvent(new KeyboardEvent("keyup", { key: " ", bubbles: true })));
  await expect(page.locator(".orb-label")).toContainText(/Segure a bolinha enquanto fala/);
  await page.evaluate(() => (Date.now = (window as unknown as { __realNow: () => number }).__realNow));
});

test("se a IA falhar, “Tentar de novo” retoma a conversa", async ({ page, backend, ai }) => {
  backend.progress = learner();
  ai.failNext(500, "upstream error");
  await openCafe(page);
  await expect(page.locator(".retry .warn")).toContainText("A conversa caiu");
  // Nothing technical reaches the learner.
  await expect(page.locator(".retry")).not.toContainText("upstream");
  await page.getByRole("button", { name: "Tentar de novo", exact: true }).click();
  await expect(page.locator(".msg.ai").first()).toContainText(AI_LINES.opening);
});

test("acabou a conversa grátis do dia: mostra o aviso e leva aos planos", async ({ page, backend, ai }) => {
  backend.progress = learner();
  ai.failNext(402, "⚠️ Você já usou a conversa grátis de hoje. [premium]");
  await openCafe(page);
  await expect(page.locator(".retry .warn")).toContainText("Você já usou a conversa grátis de hoje.");
  await expect(page.locator(".retry .warn")).not.toContainText("[premium]");
  await expect(page.locator("button.orb")).toHaveCount(0);
  await page.getByRole("button", { name: "Ver o Premium", exact: true }).click();
  await expect(page.locator(".pricing, .pricing-top").first()).toBeVisible();
});

test("o estilo escolhido para a IA vai junto no pedido", async ({ page, backend, ai }) => {
  backend.progress = learner();
  await page.goto("/");
  await page.getByRole("button", { name: /Conversa com IA|Conversar com a IA|Conversa/ }).first().click();
  await page.locator(".style-card summary").click();
  const accent = page.locator(".style-row", { hasText: "Sotaque" }).locator(".style-chip").last();
  await accent.click();
  await page.locator(".topic", { hasText: "Aeroporto" }).click();
  await expect(page.locator(".msg.ai").first()).toBeVisible();
  expect(ai.chatTurns[0].topic).toBe("airport");
  expect(ai.chatTurns[0].style.accent).toBe("en-GB");
  await expect.poll(() => (backend.progress?.aiStyle as { accent: string } | undefined)?.accent).toBe("en-GB");
});

test("iPhone: a voz da IA prepara o áudio para tocar no silencioso e o microfone continuar gravando", async ({ page, backend }, info) => {
  test.skip(info.project.name !== "iphone", "só o iPhone tem esse modo de áudio");
  backend.progress = learner();
  await openCafe(page);
  await expect(page.locator(".msg.ai").first()).toBeVisible();
  // The AI's line goes through the device voice, which asks for play-and-record first.
  await expect.poll(() => page.evaluate(() => (navigator as Navigator & { audioSession: { type: string } }).audioSession.type)).toBe("play-and-record");
  // The second turn still reaches the AI (the mic opens again after the voice spoke).
  await holdOrbAndSay(page, "i want coffee");
  await expect(page.locator(".msg.ai").nth(1)).toContainText("Do you want it hot or iced?");
  await holdOrbAndSay(page, "iced please");
  await expect(page.locator(".msg.ai").nth(2)).toContainText(AI_LINES.third);
});
