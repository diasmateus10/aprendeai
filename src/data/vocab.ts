// Picture vocabulary for the flashcards: the learner sees an image and says the English word.
// Emojis are the images: free, offline and readable on every phone.

import type { Level } from "../lib/progress";

export interface VocabItem {
  emoji: string;
  /** Main answer, shown after the card is answered. */
  en: string;
  /** Other answers that also count as right (synonyms, US/UK spellings). */
  alt?: string[];
  pt: string;
}

export interface VocabCategory {
  id: string;
  title: string;
  /** Lowest level that studies this category. */
  level: Level;
  /** Verbs accept -ing/-s/-ed forms ("running" for "run"). */
  verbs?: boolean;
  items: VocabItem[];
}

export const VOCAB: VocabCategory[] = [
  {
    id: "food",
    title: "Comida",
    level: "iniciante",
    items: [
      { emoji: "🍎", en: "apple", pt: "maçã" },
      { emoji: "🍌", en: "banana", pt: "banana" },
      { emoji: "🍞", en: "bread", pt: "pão" },
      { emoji: "🧀", en: "cheese", pt: "queijo" },
      { emoji: "🥚", en: "egg", pt: "ovo" },
      { emoji: "🥛", en: "milk", pt: "leite" },
      { emoji: "☕", en: "coffee", pt: "café" },
      { emoji: "💧", en: "water", pt: "água" },
      { emoji: "🍕", en: "pizza", pt: "pizza" },
      { emoji: "🍚", en: "rice", pt: "arroz" },
      { emoji: "🍗", en: "chicken", pt: "frango" },
      { emoji: "🍰", en: "cake", pt: "bolo" },
    ],
  },
  {
    id: "animals",
    title: "Animais",
    level: "iniciante",
    items: [
      { emoji: "🐶", en: "dog", alt: ["puppy"], pt: "cachorro" },
      { emoji: "🐱", en: "cat", alt: ["kitten"], pt: "gato" },
      { emoji: "🐦", en: "bird", pt: "pássaro" },
      { emoji: "🐟", en: "fish", pt: "peixe" },
      { emoji: "🐴", en: "horse", pt: "cavalo" },
      { emoji: "🐮", en: "cow", pt: "vaca" },
      { emoji: "🐷", en: "pig", pt: "porco" },
      { emoji: "🐭", en: "mouse", pt: "rato" },
      { emoji: "🐑", en: "sheep", pt: "ovelha" },
      { emoji: "🐻", en: "bear", pt: "urso" },
    ],
  },
  {
    id: "home",
    title: "Objetos da casa",
    level: "iniciante",
    items: [
      { emoji: "🛏️", en: "bed", pt: "cama" },
      { emoji: "🪑", en: "chair", pt: "cadeira" },
      { emoji: "🚪", en: "door", pt: "porta" },
      { emoji: "🪟", en: "window", pt: "janela" },
      { emoji: "🔑", en: "key", pt: "chave" },
      { emoji: "📱", en: "phone", alt: ["cell phone", "cellphone", "smartphone", "mobile"], pt: "celular" },
      { emoji: "📚", en: "books", alt: ["book"], pt: "livros" },
      { emoji: "⏰", en: "clock", alt: ["alarm clock", "alarm"], pt: "relógio / despertador" },
      { emoji: "🛋️", en: "sofa", alt: ["couch"], pt: "sofá" },
      { emoji: "💡", en: "light bulb", alt: ["lamp", "light", "bulb", "lightbulb"], pt: "lâmpada" },
    ],
  },
  {
    id: "actions-basic",
    title: "Ações do dia a dia",
    level: "iniciante",
    verbs: true,
    items: [
      { emoji: "🏃", en: "run", pt: "correr" },
      { emoji: "🚶", en: "walk", pt: "andar / caminhar" },
      { emoji: "😴", en: "sleep", pt: "dormir" },
      { emoji: "🍽️", en: "eat", pt: "comer" },
      { emoji: "🥤", en: "drink", pt: "beber" },
      { emoji: "📖", en: "read", pt: "ler" },
      { emoji: "✍️", en: "write", pt: "escrever" },
      { emoji: "🏊", en: "swim", pt: "nadar" },
      { emoji: "💃", en: "dance", pt: "dançar" },
      { emoji: "🎤", en: "sing", pt: "cantar" },
    ],
  },
  {
    id: "clothes",
    title: "Roupas",
    level: "basico",
    items: [
      { emoji: "👕", en: "shirt", alt: ["t-shirt", "t shirt", "tshirt"], pt: "camiseta" },
      { emoji: "👖", en: "jeans", alt: ["pants", "trousers"], pt: "calça jeans" },
      { emoji: "👗", en: "dress", pt: "vestido" },
      { emoji: "👟", en: "sneakers", alt: ["shoes", "shoe", "sneaker", "trainers"], pt: "tênis" },
      { emoji: "🧢", en: "cap", alt: ["hat"], pt: "boné" },
      { emoji: "🧦", en: "socks", alt: ["sock"], pt: "meias" },
      { emoji: "🧥", en: "coat", alt: ["jacket"], pt: "casaco" },
      { emoji: "🕶️", en: "sunglasses", alt: ["glasses"], pt: "óculos de sol" },
      { emoji: "🧣", en: "scarf", pt: "cachecol" },
      { emoji: "🎒", en: "backpack", alt: ["bag", "school bag"], pt: "mochila" },
    ],
  },
  {
    id: "body",
    title: "Corpo",
    level: "basico",
    items: [
      { emoji: "👁️", en: "eye", alt: ["eyes"], pt: "olho" },
      { emoji: "👂", en: "ear", pt: "orelha" },
      { emoji: "👃", en: "nose", pt: "nariz" },
      { emoji: "👄", en: "mouth", alt: ["lips"], pt: "boca" },
      { emoji: "✋", en: "hand", pt: "mão" },
      { emoji: "🦶", en: "foot", alt: ["feet"], pt: "pé" },
      { emoji: "🦷", en: "tooth", alt: ["teeth"], pt: "dente" },
      { emoji: "💪", en: "arm", alt: ["muscle", "biceps"], pt: "braço / músculo" },
      { emoji: "🦵", en: "leg", pt: "perna" },
      { emoji: "🧠", en: "brain", pt: "cérebro" },
    ],
  },
  {
    id: "transport",
    title: "Transporte e lugares",
    level: "basico",
    items: [
      { emoji: "🚗", en: "car", pt: "carro" },
      { emoji: "🚌", en: "bus", pt: "ônibus" },
      { emoji: "✈️", en: "plane", alt: ["airplane", "aeroplane"], pt: "avião" },
      { emoji: "🚲", en: "bike", alt: ["bicycle"], pt: "bicicleta" },
      { emoji: "🚆", en: "train", pt: "trem" },
      { emoji: "🏥", en: "hospital", pt: "hospital" },
      { emoji: "🏫", en: "school", pt: "escola" },
      { emoji: "🏖️", en: "beach", pt: "praia" },
      { emoji: "🏦", en: "bank", pt: "banco" },
      { emoji: "🛒", en: "shopping cart", alt: ["cart", "supermarket", "trolley"], pt: "carrinho de compras" },
    ],
  },
  {
    id: "actions-more",
    title: "Mais ações",
    level: "basico",
    verbs: true,
    items: [
      { emoji: "🍳", en: "cook", pt: "cozinhar" },
      { emoji: "🧹", en: "clean", alt: ["sweep"], pt: "limpar / varrer" },
      { emoji: "🛍️", en: "shop", alt: ["go shopping", "shopping", "buy"], pt: "fazer compras" },
      { emoji: "📞", en: "call", alt: ["phone"], pt: "ligar / telefonar" },
      { emoji: "🚿", en: "shower", alt: ["take a shower"], pt: "tomar banho" },
      { emoji: "🎮", en: "play", alt: ["play video games", "play games", "game"], pt: "jogar" },
      { emoji: "🧘", en: "meditate", alt: ["do yoga", "yoga"], pt: "meditar" },
      { emoji: "🚴", en: "ride", alt: ["ride a bike", "cycle", "bike"], pt: "andar de bicicleta" },
      { emoji: "🧗", en: "climb", pt: "escalar" },
      { emoji: "👋", en: "wave", alt: ["say hi", "say hello", "hello", "hi"], pt: "acenar" },
    ],
  },
  {
    id: "feelings",
    title: "Sentimentos",
    level: "intermediario",
    items: [
      { emoji: "😀", en: "happy", alt: ["glad"], pt: "feliz" },
      { emoji: "😢", en: "sad", alt: ["crying", "upset"], pt: "triste" },
      { emoji: "😠", en: "angry", alt: ["mad"], pt: "bravo" },
      { emoji: "😱", en: "scared", alt: ["afraid", "frightened", "terrified", "shocked"], pt: "assustado" },
      { emoji: "😴", en: "tired", alt: ["sleepy"], pt: "cansado / com sono" },
      { emoji: "🤒", en: "sick", alt: ["ill"], pt: "doente" },
      { emoji: "😕", en: "confused", pt: "confuso" },
      { emoji: "😳", en: "embarrassed", alt: ["shy"], pt: "envergonhado" },
      { emoji: "🤩", en: "excited", alt: ["amazed"], pt: "animado / empolgado" },
      { emoji: "😬", en: "nervous", alt: ["awkward", "anxious"], pt: "nervoso" },
    ],
  },
  {
    id: "work",
    title: "Trabalho e tecnologia",
    level: "intermediario",
    items: [
      { emoji: "💻", en: "laptop", alt: ["computer", "notebook"], pt: "notebook" },
      { emoji: "⌨️", en: "keyboard", pt: "teclado" },
      { emoji: "🖨️", en: "printer", pt: "impressora" },
      { emoji: "📧", en: "email", alt: ["e-mail", "mail"], pt: "e-mail" },
      { emoji: "📅", en: "calendar", alt: ["schedule"], pt: "calendário / agenda" },
      { emoji: "💼", en: "briefcase", alt: ["bag"], pt: "pasta / maleta" },
      { emoji: "📊", en: "chart", alt: ["graph", "bar chart", "report"], pt: "gráfico" },
      { emoji: "🤝", en: "handshake", alt: ["deal", "shake hands"], pt: "aperto de mão / acordo" },
      { emoji: "💰", en: "money", alt: ["cash"], pt: "dinheiro" },
      { emoji: "📎", en: "paper clip", alt: ["paperclip", "clip"], pt: "clipe" },
    ],
  },
  {
    id: "actions-advanced",
    title: "Ações e expressões",
    level: "intermediario",
    verbs: true,
    items: [
      { emoji: "🤔", en: "think", alt: ["wonder"], pt: "pensar" },
      { emoji: "🤷", en: "shrug", alt: ["i don't know", "don't know"], pt: "dar de ombros" },
      { emoji: "🙏", en: "pray", alt: ["thank you", "please", "thanks"], pt: "rezar / agradecer" },
      { emoji: "👏", en: "clap", alt: ["applaud"], pt: "aplaudir" },
      { emoji: "🤗", en: "hug", pt: "abraçar" },
      { emoji: "🏋️", en: "lift weights", alt: ["work out", "workout", "exercise", "lift"], pt: "levantar peso / malhar" },
      { emoji: "🧳", en: "pack", alt: ["travel"], pt: "fazer a mala / viajar" },
      { emoji: "🛫", en: "take off", alt: ["departure", "depart", "fly"], pt: "decolar" },
      { emoji: "🔍", en: "search", alt: ["look for", "find"], pt: "procurar" },
      { emoji: "🗣️", en: "speak", alt: ["talk", "say"], pt: "falar" },
    ],
  },
];

const LEVEL_ORDER: Level[] = ["iniciante", "basico", "intermediario", "avancado"];

export function categoriesFor(level: Level | null): VocabCategory[] {
  const max = LEVEL_ORDER.indexOf(level ?? "iniciante");
  return VOCAB.filter((c) => LEVEL_ORDER.indexOf(c.level) <= max);
}
