// Daily production check of the voice conversation (see playwright.prod.config.ts). The microphone is Chrome's
// fake device playing e2e-prod/fixtures/coffee.wav ("I would like a coffee, please."), and it is made to open
// slowly, as on an iPhone: on 2026-11-12 a learner's first press ended before the mic had opened, the mic was left
// on with nothing listening, and every later answer recorded silence. That is the journey checked here.

import { expect, test, type Page } from "@playwright/test";

const email = process.env.SMOKE_EMAIL ?? "";
const password = process.env.SMOKE_PASSWORD ?? "";

/** How long the fake microphone takes to open (the iPhone took about 1.4 s, longer while asking for permission). */
const SLOW_MIC_MS = 1500;

test.beforeAll(() => {
  if (!email || !password) throw new Error("Set SMOKE_EMAIL and SMOKE_PASSWORD (the robot account) to run the production check.");
});

test("servidor: voz da IA, áudios gravados e conversa por voz disponíveis", async ({ request }) => {
  const tts = await request.get(`/api/tts?${new URLSearchParams({ t: `Daily check ${new Date().toISOString().slice(0, 10)}`, v: "adult", a: "en-US", s: "0" })}`);
  expect(tts.status(), "/api/tts (Azure voice)").toBe(200);
  expect(tts.headers()["content-type"]).toContain("audio/mpeg");
  expect((await tts.body()).length).toBeGreaterThan(2000);

  const talk = await request.get("/api/talk");
  expect(talk.status(), "/api/talk says whether voice turns are set up (Claude + Azure keys)").toBe(200);
  expect(await talk.json()).toEqual({ voice: true });

  const manifest = await request.get("/audio/manifest.json");
  expect(manifest.status(), "recorded course audio").toBe(200);
});

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByRole("tab", { name: "Já tenho conta", exact: true }).click();
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByText("Sua trilha")).toBeVisible();
}

/** Holds the orb (Space on the focused orb, like the e2e suite) for `ms`, then lets go. */
async function holdOrb(page: Page, ms: number) {
  const orb = page.locator("button.orb");
  await expect(orb).toBeEnabled();
  await orb.focus();
  await page.keyboard.down("Space");
  await page.waitForTimeout(ms);
  await page.keyboard.up("Space");
}

test("conversa por voz: soltar cedo não trava o microfone, e a fala é ouvida e respondida com voz", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript((delay) => {
    const devices = navigator.mediaDevices;
    const open = devices.getUserMedia.bind(devices);
    devices.getUserMedia = (constraints) => new Promise((r) => setTimeout(r, delay)).then(() => open(constraints));
    // Keeps a copy of each voice turn's streamed answer; the app still reads it as it streams.
    const w = window as unknown as { __talk: string[] };
    w.__talk = [];
    const fetchOriginal = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const res = await fetchOriginal(input, init);
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith("/api/talk") && init?.method === "POST") void res.clone().text().then((t) => w.__talk.push(`${res.status}\n${t}`));
      return res;
    };
  }, SLOW_MIC_MS);

  await signIn(page);
  await page.getByRole("button", { name: /Conversa com IA|Conversar com a IA|Conversa/ }).first().click();
  await expect(page.getByRole("heading", { name: "Conversa com IA" })).toBeVisible();
  await page.locator(".topic", { hasText: "No café" }).click();

  // The partner opens the conversation (Claude through /api/chat).
  await expect(page.locator(".msg.ai").first()).not.toBeEmpty({ timeout: 30_000 });

  // A press shorter than the time the mic takes to open: it must keep opening, not count as silence.
  await holdOrb(page, 500);
  await expect(page.locator(".orb-label")).toHaveText("O microfone está ligando. Segure a bolinha de novo e fale.");
  await page.waitForTimeout(SLOW_MIC_MS + 500);

  // A real answer: the recording reaches the server, Azure hears it, Claude replies and the reply has a voice.
  await holdOrb(page, 5000);
  const talks = () => page.evaluate(() => (window as unknown as { __talk: string[] }).__talk);
  await expect.poll(async () => (await talks()).length, { message: "the recording was sent (POST /api/talk)", timeout: 60_000 }).toBe(1);
  const [status, ...lines] = (await talks())[0].split("\n");
  expect(status, "POST /api/talk").toBe("200");
  const events = lines.filter(Boolean).map((line) => JSON.parse(line) as { type: string; text?: string; audio?: string | null; error?: string });
  expect(events.find((e) => e.type === "error"), "the voice turn reported an error").toBeUndefined();
  expect(events.find((e) => e.type === "user")?.text ?? "", "what Azure heard").toMatch(/coffee/i);
  expect(events.find((e) => e.type === "reply")?.text ?? "", "Claude's reply").not.toBe("");
  expect(events.some((e) => e.type === "audio" && !!e.audio), "the reply's voice (Azure)").toBe(true);

  // And the screen shows it.
  await expect(page.locator(".msg.me").first()).toContainText(/coffee/i);
  await expect(page.locator(".msg.ai")).toHaveCount(2);
  expect(errors, "uncaught errors in the page").toEqual([]);
});
