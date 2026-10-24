// Downloads a real photo for every adult flashcard word from Pexels (free license, commercial use ok),
// crops it square and saves it in public/photos, plus src/data/photos.json with each photographer's credit.
//   node scripts/pexels-photos.mjs              all words that have no photo yet
//   node scripts/pexels-photos.mjs dog=2 eye    redo some words; "=2" takes the 3rd search result
// Needs PEXELS_API_KEY in .env and `sharp` (npm i -D sharp).

import fs from "node:fs";
import sharp from "sharp";

const root = new URL("..", import.meta.url);
const env = Object.fromEntries(
  fs
    .readFileSync(new URL(".env", root), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
if (!env.PEXELS_API_KEY) throw new Error("Put PEXELS_API_KEY in .env first.");

// Search terms where the word alone would bring the wrong kind of picture.
const QUERIES = {
  milk: "glass of milk",
  coffee: "cup of coffee",
  water: "glass of water",
  rice: "bowl of white rice",
  chicken: "roast chicken dish",
  fish: "fish swimming",
  mouse: "mouse rodent",
  bed: "bed bedroom",
  door: "front door house",
  key: "house key",
  phone: "smartphone in hand",
  books: "stack of books",
  clock: "wall clock",
  run: "person running",
  walk: "person walking street",
  sleep: "person sleeping in bed",
  eat: "person eating meal",
  drink: "person drinking water",
  read: "person reading a book",
  write: "hand writing in notebook",
  swim: "person swimming pool",
  dance: "couple dancing",
  sing: "person singing microphone",
  shirt: "t-shirt",
  cap: "baseball cap",
  eye: "human eye close up",
  ear: "human ear close up",
  nose: "human nose close up",
  mouth: "smiling lips close up",
  hand: "open hand palm",
  foot: "bare feet",
  tooth: "white teeth smile",
  arm: "arm muscle",
  leg: "legs walking",
  brain: "brain anatomical model",
  plane: "airplane flying sky",
  bike: "bicycle",
  hospital: "hospital building",
  school: "school building",
  bank: "bank building",
  "shopping cart": "shopping cart supermarket",
  cook: "person cooking in kitchen",
  clean: "person cleaning house",
  shop: "woman with shopping bags",
  call: "person on phone call",
  shower: "shower head water",
  play: "children playing",
  meditate: "person meditating",
  ride: "person riding bicycle",
  climb: "rock climbing",
  wave: "person waving hand hello",
  happy: "happy smiling person",
  sad: "sad person",
  angry: "angry face",
  scared: "scared face",
  tired: "tired person yawning",
  sick: "sick person with thermometer",
  confused: "confused person",
  embarrassed: "embarrassed person covering face",
  excited: "excited person celebrating",
  nervous: "nervous person biting nails",
  keyboard: "computer keyboard",
  email: "email inbox on laptop",
  calendar: "calendar planner",
  chart: "business chart on screen",
  money: "cash money",
  "paper clip": "paper clip",
  think: "person thinking",
  shrug: "person shrugging",
  pray: "praying hands",
  clap: "hands clapping",
  hug: "people hugging",
  "lift weights": "person lifting weights gym",
  pack: "packing a suitcase",
  "take off": "airplane taking off",
  search: "magnifying glass",
  speak: "person talking",
};

const vocab = fs.readFileSync(new URL("src/data/vocab.ts", root), "utf8");
const words = [...new Set([...vocab.matchAll(/en: "([^"]+)"/g)].map((m) => m[1]))];
const slug = (w) => w.replace(/\s+/g, "-");

const manifestFile = new URL("src/data/photos.json", root);
const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, "utf8")) : {};
fs.mkdirSync(new URL("public/photos/", root), { recursive: true });

// "word" or "word=N": which words to (re)do and which search result to take.
const picks = Object.fromEntries(process.argv.slice(2).map((a) => [a.split("=")[0], Number(a.split("=")[1] ?? 0)]));
const todo = Object.keys(picks).length ? Object.keys(picks) : words.filter((w) => !manifest[w]);

for (const word of todo) {
  const query = QUERIES[word] ?? word;
  const res = await fetch(`https://api.pexels.com/v1/search?${new URLSearchParams({ query, per_page: "8", orientation: "square" })}`, {
    headers: { Authorization: env.PEXELS_API_KEY },
  });
  if (!res.ok) {
    console.log(`✗ ${word}: Pexels ${res.status}`);
    if (res.status === 429) break;
    continue;
  }
  const { photos } = await res.json();
  const photo = photos[picks[word] ?? 0];
  if (!photo) {
    console.log(`✗ ${word}: nenhuma foto para "${query}"`);
    continue;
  }
  const image = Buffer.from(await (await fetch(photo.src.large)).arrayBuffer());
  await sharp(image).resize(400, 400, { fit: "cover", position: "attention" }).webp({ quality: 78 }).toFile(new URL(`public/photos/${slug(word)}.webp`, root));
  manifest[word] = { file: `${slug(word)}.webp`, by: photo.photographer, url: photo.url };
  console.log(`✓ ${word} ← "${query}" (#${picks[word] ?? 0}, ${photo.photographer})`);
}

fs.writeFileSync(manifestFile, JSON.stringify(Object.fromEntries(Object.entries(manifest).sort()), null, 1) + "\n");
console.log(`${Object.keys(manifest).length}/${words.length} palavras com foto`);
