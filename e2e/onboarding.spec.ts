// A new learner arrives: account, who is learning, placement test, themes, home.

import { expect, learner, test } from "./support/fixtures";
import { answerExercise } from "./support/student";

test.describe("conta nova", () => {
  test.use({ signedIn: false });

  test("cria a conta, faz o nivelamento sem saber nada e chega à trilha como Iniciante", async ({ page, backend }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Fale inglês de verdade/ })).toBeVisible();

    await page.getByLabel("E-mail").fill("nova@teste.com");
    await page.getByLabel(/Crie uma senha/).fill("segredo123");
    await page.getByRole("button", { name: "Criar conta grátis", exact: true }).click();

    await page.getByRole("button", { name: /Para mim/ }).click();
    await page.getByRole("button", { name: /Fazer o teste/ }).click();

    // Stage 1: three "Não sei" and the test stops at the first level.
    for (let i = 0; i < 3; i++) {
      await expect(page.getByText("Etapa 1/4")).toBeVisible();
      await page.getByRole("button", { name: "Não sei", exact: true }).click();
      await page.waitForTimeout(950);
    }
    await expect(page.locator(".level-name")).toHaveText("Iniciante");
    await page.getByRole("button", { name: "Começar", exact: true }).click();

    // Themes: the button only works with exactly five.
    await expect(page.getByRole("heading", { name: "Monte sua trilha" })).toBeVisible();
    const build = page.getByRole("button", { name: /Montar minha trilha|Escolha mais/ });
    await expect(build).toBeDisabled();
    for (const t of ["Comida", "Viagem", "Trabalho", "Tecnologia", "Filmes"]) {
      await page.locator(".theme-choice", { hasText: t }).first().click();
    }
    await expect(build).toHaveText("Montar minha trilha");
    await build.click();

    await expect(page.getByText("Sua trilha")).toBeVisible();
    // The onboarding is saved in the account.
    await expect.poll(() => (backend.progress?.themes as string[] | null)?.length).toBe(5);
    expect(backend.progress).toMatchObject({ mode: "adult", level: "iniciante" });
  });

  test("“Criar conta” com e-mail que já tem conta: avisa “Você já tem conta!” e abre o app", async ({ page, backend }) => {
    backend.accountExists = true;
    backend.progress = learner({ level: "basico", xp: 120 });
    await page.goto("/");
    await page.getByLabel("E-mail").fill("aluno@teste.com");
    await page.getByLabel(/Crie uma senha/).fill("segredo123");
    await page.getByRole("button", { name: "Criar conta grátis", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Você já tem conta!" })).toBeVisible();
    // Then straight into the app, with the account's progress.
    await expect(page.getByText("Sua trilha")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Você já tem conta!" })).toHaveCount(0);
  });

  test("“Criar conta” com e-mail que já tem conta e senha errada: leva para “Já tenho conta” e explica", async ({ page, backend }) => {
    backend.accountExists = true;
    backend.wrongPasswords.add("outra-senha");
    await page.goto("/");
    await page.getByLabel("E-mail").fill("aluno@teste.com");
    await page.getByLabel(/Crie uma senha/).fill("outra-senha");
    await page.getByRole("button", { name: "Criar conta grátis", exact: true }).click();

    await expect(page.getByRole("alert")).toContainText("Você já tem uma conta com esse e-mail");
    await expect(page.getByRole("tab", { name: "Já tenho conta", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeVisible();
  });

  test("senha errada mostra o erro em português", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: "Já tenho conta", exact: true }).click();
    await page.getByLabel("E-mail").fill("aluno@teste.com");
    await page.getByLabel("Senha", { exact: true }).fill("senha-errada");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText("E-mail ou senha incorretos.");
  });

  test("entra numa conta que já tem progresso e continua de onde parou", async ({ page, backend }) => {
    backend.progress = learner({ level: "basico", completed: { "hello-escuta": 3 }, xp: 120, streak: 4, lastDay: null });
    await page.goto("/");
    await page.getByRole("tab", { name: "Já tenho conta", exact: true }).click();
    await page.getByLabel("E-mail").fill("aluno@teste.com");
    await page.getByLabel("Senha", { exact: true }).fill("segredo123");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.getByText("Sua trilha")).toBeVisible();
    await expect(page.getByText("Para mim")).toHaveCount(0);
  });
});

test("nivelamento acertando tudo coloca no nível Avançado", async ({ page, backend }) => {
  backend.progress = { mode: "adult" };
  await page.goto("/");
  await page.getByRole("button", { name: /Fazer o teste/ }).click();
  for (let stage = 1; stage <= 4; stage++) {
    for (let q = 0; q < 3; q++) {
      await expect(page.getByText(`Etapa ${stage}/4`)).toBeVisible();
      await answerExercise(page);
      await page.waitForTimeout(950);
    }
  }
  await expect(page.locator(".level-name")).toHaveText("Avançado");
});

test("modo Kids: escolher para o filho abre a escolha de idade", async ({ page, backend }) => {
  backend.progress = null;
  await page.goto("/");
  await page.getByRole("button", { name: /Para meu filho ou filha/ }).click();
  await expect(page.getByText(/idade|anos/i).first()).toBeVisible();
  await expect.poll(() => backend.progress?.mode).toBe("kids");
});
