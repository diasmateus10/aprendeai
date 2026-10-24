// Downloads a real photo for every adult flashcard word from Pixabay (free license, commercial use ok,
// and their API asks for images to be stored on our side rather than hotlinked), crops it square and saves
// it in public/photos, plus src/data/photos.json with each photographer's credit.
//   node scripts/flashcard-photos.mjs              all words that have no photo yet
//   node scripts/flashcard-photos.mjs dog=2 eye    redo some words; "=2" takes the 3rd search result
// Needs PIXABAY_API_KEY in .env and `sharp` (npm i -D sharp).

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = new URL("..", import.meta.url);
const env = Object.fromEntries(
  fs
    .readFileSync(new URL(".env", root), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
if (!env.PIXABAY_API_KEY) throw new Error("Put PIXABAY_API_KEY in .env first.");

// Search terms where the word alone would bring the wrong kind of picture.
const QUERIES = {
  window: "open window",
  socks: "colorful socks",
  jeans: "blue jeans denim",
  dress: "woman wearing long dress",
  cheese: "cheese wedge",
  bus: "double decker bus",
  briefcase: "leather briefcase",
  milk: "glass of milk",
  coffee: "cup of coffee",
  water: "glass of water",
  rice: "bowl of white rice",
  chicken: "fried chicken drumsticks",
  fish: "fish swimming",
  mouse: "mouse rodent",
  bed: "bed bedroom",
  door: "front door house",
  key: "house key",
  phone: "smartphone in hand",
  books: "stack of books",
  clock: "wall clock",
  run: "woman jogging",
  walk: "person walking street",
  sleep: "woman sleeping bed",
  eat: "person eating meal",
  drink: "woman drinking water glass",
  read: "person reading a book",
  write: "hand writing pen paper",
  swim: "swimmer pool",
  dance: "couple dancing",
  sing: "person singing microphone",
  shirt: "t-shirt",
  cap: "baseball cap",
  eye: "human eye close up",
  ear: "human ear",
  nose: "human nose close up",
  mouth: "smiling lips close up",
  hand: "open hand palm",
  foot: "bare feet",
  tooth: "teeth dentist",
  arm: "biceps flex",
  leg: "legs walking",
  brain: "brain model anatomy",
  plane: "plane sky",
  bike: "bicycle",
  hospital: "hospital",
  school: "school building",
  bank: "bank facade",
  "shopping cart": "shopping cart supermarket",
  cook: "chef cooking frying pan",
  clean: "cleaning floor mop",
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
  angry: "angry man shouting",
  scared: "scared face",
  tired: "tired person yawning",
  sick: "sick person with thermometer",
  confused: "confused person",
  embarrassed: "embarrassed",
  excited: "excited person celebrating",
  nervous: "nervous woman",
  keyboard: "computer keyboard",
  email: "email inbox on laptop",
  calendar: "calendar planner",
  chart: "business chart on screen",
  money: "cash money",
  "paper clip": "paper clip office",
  think: "person thinking",
  shrug: "shrug",
  pray: "praying hands",
  clap: "clapping",
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
  const params = new URLSearchParams({
    key: env.PIXABAY_API_KEY,
    q: query,
    image_type: "photo",
    safesearch: "true",
    per_page: "10",
    order: "popular",
  });
  const res = await fetch(`https://pixabay.com/api/?${params}`);
  if (!res.ok) {
    console.log(`✗ ${word}: Pixabay ${res.status}`);
    if (res.status === 429) break;
    continue;
  }
  const { hits } = await res.json();
  const photo = hits[picks[word] ?? 0];
  if (!photo) {
    console.log(`✗ ${word}: nenhuma foto para "${query}"`);
    continue;
  }
  const image = Buffer.from(await (await fetch(photo.webformatURL)).arrayBuffer());
  await sharp(image).resize(400, 400, { fit: "cover", position: "attention" }).webp({ quality: 78 }).toFile(fileURLToPath(new URL(`public/photos/${slug(word)}.webp`, root)));
  manifest[word] = { file: `${slug(word)}.webp`, by: photo.user, url: photo.pageURL };
  console.log(`✓ ${word} ← "${query}" (#${picks[word] ?? 0}, ${photo.user})`);
  // Pixabay allows 100 requests a minute.
  await new Promise((r) => setTimeout(r, 700));
}

fs.writeFileSync(manifestFile, JSON.stringify(Object.fromEntries(Object.entries(manifest).sort()), null, 1) + "\n");
console.log(`${Object.keys(manifest).length}/${words.length} palavras com foto`);
