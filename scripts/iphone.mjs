// Opens the app in WebKit (Safari's engine) with an iPhone profile, runs a list of steps,
// saves screenshots and prints console logs and page errors. Used to check changes without a Mac.
//
//   node scripts/iphone.mjs [url-or-path] [step ...]
//
// Steps (run in order):
//   tap:<selector>         tap an element (Playwright selector, e.g. "text=Começar", "button >> nth=0")
//   type:<selector>|<text> fill a field
//   key:<key>              press a key (Enter, Tab, ...)
//   go:<path>              navigate to a path of the app
//   wait:<ms>              wait
//   shot[:<name>]          screenshot to .iphone/<name>.png (one is always taken at the end)
//   html                   print the visible text of the page
//
// Env: IPHONE_DEVICE (default "iPhone 15"), BASE_URL (default http://localhost:5173),
//      IPHONE_STATE=1 keeps localStorage/cookies between runs in .iphone/state.json.
import { webkit, devices } from "playwright";
import { mkdirSync, existsSync } from "node:fs";

const base = process.env.BASE_URL || "http://localhost:5173";
const deviceName = process.env.IPHONE_DEVICE || "iPhone 15";
const device = devices[deviceName];
if (!device) throw new Error(`Unknown device "${deviceName}"`);

const [first = "/", ...rest] = process.argv.slice(2);
const isStep = /^(tap|type|key|go|wait|shot|html)(:|$)/.test(first);
const url = isStep ? base : first.startsWith("http") ? first : base + first;
const steps = isStep ? [first, ...rest] : rest;

const out = ".iphone";
mkdirSync(out, { recursive: true });
const statePath = `${out}/state.json`;
const keepState = process.env.IPHONE_STATE === "1";

const browser = await webkit.launch();
const context = await browser.newContext({
  ...device,
  locale: "pt-BR",
  ...(keepState && existsSync(statePath) ? { storageState: statePath } : {}),
});
const page = await context.newPage();
page.on("console", (m) => console.log(`[console.${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => console.log(`[pageerror] ${e.message}`));
page.on("requestfailed", (r) => console.log(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
page.on("response", (r) => r.status() >= 400 && console.log(`[http ${r.status()}] ${r.url()}`));

let shots = 0;
const shot = async (name) => {
  const file = `${out}/${name || `shot-${++shots}`}.png`;
  await page.screenshot({ path: file });
  console.log(`[shot] ${file}`);
};

await page.goto(url, { waitUntil: "networkidle" });
try {
for (const step of steps) {
  const i = step.indexOf(":");
  const cmd = i < 0 ? step : step.slice(0, i);
  const arg = i < 0 ? "" : step.slice(i + 1);
  console.log(`[step] ${step}`);
  if (cmd === "tap") await page.locator(arg).first().tap({ timeout: 5000 });
  else if (cmd === "type") {
    const j = arg.lastIndexOf("|");
    await page.locator(arg.slice(0, j)).first().fill(arg.slice(j + 1), { timeout: 5000 });
  } else if (cmd === "key") await page.keyboard.press(arg);
  else if (cmd === "go") await page.goto(arg.startsWith("http") ? arg : base + arg, { waitUntil: "networkidle" });
  else if (cmd === "wait") await page.waitForTimeout(Number(arg) || 500);
  else if (cmd === "shot") await shot(arg);
  else if (cmd === "html") console.log(await page.locator("body").innerText());
  if (cmd === "tap" || cmd === "key") await page.waitForTimeout(400);
}
} catch (e) {
  console.log(`[failed] ${e.message.split("\n")[0]}`);
  process.exitCode = 1;
}
await shot("final");
if (keepState) await context.storageState({ path: statePath });
await browser.close();
