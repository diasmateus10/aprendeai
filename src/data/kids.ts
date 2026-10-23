// Content for the Kids mode (children aged 6 to 10): picture words, rhymes, chat themes and stickers.
// Every emoji has a 3D illustration in public/flashcards (see imageFor in vocab.ts).

import type { VocabItem } from "./vocab";

export interface KidsCategory {
  id: string;
  title: string;
  emoji: string;
  /** Question shown on the flashcard, in simple Portuguese. */
  question: string;
  items: VocabItem[];
}

export const KIDS_VOCAB: KidsCategory[] = [
  {
    id: "animals",
    title: "Animais",
    emoji: "🐶",
    question: "Que bicho é esse?",
    items: [
      { emoji: "🐶", en: "dog", alt: ["puppy", "doggy"], pt: "cachorro" },
      { emoji: "🐱", en: "cat", alt: ["kitty", "kitten"], pt: "gato" },
      { emoji: "🐦", en: "bird", pt: "passarinho" },
      { emoji: "🐟", en: "fish", pt: "peixe" },
      { emoji: "🐴", en: "horse", pt: "cavalo" },
      { emoji: "🐮", en: "cow", pt: "vaca" },
      { emoji: "🐷", en: "pig", alt: ["piggy"], pt: "porco" },
      { emoji: "🦆", en: "duck", pt: "pato" },
      { emoji: "🐰", en: "rabbit", alt: ["bunny"], pt: "coelho" },
      { emoji: "🐸", en: "frog", pt: "sapo" },
      { emoji: "🦁", en: "lion", pt: "leão" },
      { emoji: "🐵", en: "monkey", pt: "macaco" },
      { emoji: "🐘", en: "elephant", pt: "elefante" },
      { emoji: "🐻", en: "bear", alt: ["teddy bear"], pt: "urso" },
      { emoji: "🐢", en: "turtle", alt: ["tortoise"], pt: "tartaruga" },
      { emoji: "🦋", en: "butterfly", pt: "borboleta" },
    ],
  },
  {
    id: "colors",
    title: "Cores",
    emoji: "🎨",
    question: "Que cor é essa?",
    items: [
      { emoji: "🔴", en: "red", pt: "vermelho" },
      { emoji: "🔵", en: "blue", pt: "azul" },
      { emoji: "🟢", en: "green", pt: "verde" },
      { emoji: "🟡", en: "yellow", pt: "amarelo" },
      { emoji: "🟠", en: "orange", pt: "laranja" },
      { emoji: "🟣", en: "purple", alt: ["violet"], pt: "roxo" },
      { emoji: "⚫", en: "black", pt: "preto" },
      { emoji: "⚪", en: "white", pt: "branco" },
      { emoji: "🟤", en: "brown", pt: "marrom" },
      { emoji: "🩷", en: "pink", pt: "rosa" },
    ],
  },
  {
    id: "food",
    title: "Frutas e comidas",
    emoji: "🍓",
    question: "O que é isso?",
    items: [
      { emoji: "🍎", en: "apple", pt: "maçã" },
      { emoji: "🍌", en: "banana", pt: "banana" },
      { emoji: "🍇", en: "grapes", alt: ["grape"], pt: "uvas" },
      { emoji: "🍓", en: "strawberry", pt: "morango" },
      { emoji: "🍉", en: "watermelon", pt: "melancia" },
      { emoji: "🥕", en: "carrot", pt: "cenoura" },
      { emoji: "🍞", en: "bread", pt: "pão" },
      { emoji: "🥛", en: "milk", pt: "leite" },
      { emoji: "🥚", en: "egg", pt: "ovo" },
      { emoji: "🧀", en: "cheese", pt: "queijo" },
      { emoji: "🍕", en: "pizza", pt: "pizza" },
      { emoji: "🍰", en: "cake", pt: "bolo" },
      { emoji: "🍦", en: "ice cream", pt: "sorvete" },
      { emoji: "🍪", en: "cookie", alt: ["biscuit"], pt: "biscoito" },
    ],
  },
  {
    id: "toys",
    title: "Brinquedos",
    emoji: "🧸",
    question: "Que brinquedo é esse?",
    items: [
      { emoji: "⚽", en: "ball", alt: ["soccer ball", "football"], pt: "bola" },
      { emoji: "🧸", en: "teddy bear", alt: ["teddy", "bear"], pt: "ursinho de pelúcia" },
      { emoji: "🪁", en: "kite", pt: "pipa" },
      { emoji: "🎈", en: "balloon", pt: "balão" },
      { emoji: "🚗", en: "car", alt: ["toy car"], pt: "carrinho" },
      { emoji: "🚂", en: "train", alt: ["toy train"], pt: "trenzinho" },
      { emoji: "🤖", en: "robot", pt: "robô" },
      { emoji: "🥁", en: "drum", pt: "tambor" },
      { emoji: "🧩", en: "puzzle", pt: "quebra-cabeça" },
      { emoji: "📖", en: "book", pt: "livro" },
      { emoji: "🪀", en: "yo-yo", alt: ["yoyo"], pt: "ioiô" },
    ],
  },
  {
    id: "body",
    title: "Corpo",
    emoji: "👂",
    question: "Que parte do corpo é essa?",
    items: [
      { emoji: "👁️", en: "eye", pt: "olho" },
      { emoji: "👂", en: "ear", pt: "orelha" },
      { emoji: "👃", en: "nose", pt: "nariz" },
      { emoji: "👄", en: "mouth", alt: ["lips"], pt: "boca" },
      { emoji: "✋", en: "hand", pt: "mão" },
      { emoji: "🦶", en: "foot", alt: ["feet"], pt: "pé" },
      { emoji: "🦷", en: "tooth", alt: ["teeth"], pt: "dente" },
      { emoji: "🦵", en: "leg", pt: "perna" },
    ],
  },
  {
    id: "family",
    title: "Família",
    emoji: "🏠",
    question: "Quem é?",
    items: [
      { emoji: "👩", en: "mom", alt: ["mother", "mommy", "mum", "mummy"], pt: "mamãe" },
      { emoji: "👨", en: "dad", alt: ["father", "daddy"], pt: "papai" },
      { emoji: "👶", en: "baby", pt: "bebê" },
      { emoji: "👵", en: "grandma", alt: ["grandmother", "granny"], pt: "vovó" },
      { emoji: "👴", en: "grandpa", alt: ["grandfather"], pt: "vovô" },
      { emoji: "👦", en: "boy", pt: "menino" },
      { emoji: "👧", en: "girl", pt: "menina" },
    ],
  },
  {
    id: "numbers",
    title: "Números",
    emoji: "🔢",
    question: "Que número é esse?",
    items: [
      { emoji: "1️⃣", en: "one", alt: ["1"], pt: "um" },
      { emoji: "2️⃣", en: "two", alt: ["2", "too", "to"], pt: "dois" },
      { emoji: "3️⃣", en: "three", alt: ["3", "tree"], pt: "três" },
      { emoji: "4️⃣", en: "four", alt: ["4", "for"], pt: "quatro" },
      { emoji: "5️⃣", en: "five", alt: ["5"], pt: "cinco" },
      { emoji: "6️⃣", en: "six", alt: ["6"], pt: "seis" },
      { emoji: "7️⃣", en: "seven", alt: ["7"], pt: "sete" },
      { emoji: "8️⃣", en: "eight", alt: ["8"], pt: "oito" },
      { emoji: "9️⃣", en: "nine", alt: ["9"], pt: "nove" },
      { emoji: "🔟", en: "ten", alt: ["10"], pt: "dez" },
    ],
  },
  {
    id: "nature",
    title: "Natureza",
    emoji: "🌈",
    question: "O que é isso?",
    items: [
      { emoji: "☀️", en: "sun", pt: "sol" },
      { emoji: "🌙", en: "moon", pt: "lua" },
      { emoji: "⭐", en: "star", pt: "estrela" },
      { emoji: "☁️", en: "cloud", pt: "nuvem" },
      { emoji: "🌧️", en: "rain", pt: "chuva" },
      { emoji: "❄️", en: "snow", alt: ["snowflake"], pt: "neve" },
      { emoji: "🌳", en: "tree", pt: "árvore" },
      { emoji: "🌸", en: "flower", pt: "flor" },
      { emoji: "🌈", en: "rainbow", pt: "arco-íris" },
    ],
  },
];

export interface RhymeLine {
  en: string;
  pt: string;
}

export interface Rhyme {
  id: string;
  title: string;
  emoji: string;
  lines: RhymeLine[];
}

// Traditional nursery rhymes (public domain) plus a few short original chants.
export const RHYMES: Rhyme[] = [
  {
    id: "hello",
    title: "Hello, hello!",
    emoji: "👋",
    lines: [
      { en: "Hello, hello, how are you?", pt: "Olá, olá, como vai você?" },
      { en: "I am fine, and how are you?", pt: "Eu estou bem, e você?" },
      { en: "Good morning, good morning, it is a sunny day!", pt: "Bom dia, bom dia, é um dia de sol!" },
      { en: "I am happy, I am happy, let's go out and play!", pt: "Estou feliz, estou feliz, vamos brincar lá fora!" },
    ],
  },
  {
    id: "colors",
    title: "Colors, colors",
    emoji: "🎨",
    lines: [
      { en: "Red and yellow, green and blue,", pt: "Vermelho e amarelo, verde e azul," },
      { en: "I love colors, how about you?", pt: "Eu adoro cores, e você?" },
      { en: "Pink and purple, orange too,", pt: "Rosa e roxo, laranja também," },
      { en: "A rainbow for me and a rainbow for you!", pt: "Um arco-íris pra mim e um arco-íris pra você!" },
    ],
  },
  {
    id: "twinkle",
    title: "Twinkle, Twinkle, Little Star",
    emoji: "⭐",
    lines: [
      { en: "Twinkle, twinkle, little star,", pt: "Brilha, brilha, estrelinha," },
      { en: "How I wonder what you are!", pt: "Quero saber o que você é!" },
      { en: "Up above the world so high,", pt: "Lá no alto, sobre o mundo," },
      { en: "Like a diamond in the sky.", pt: "Como um diamante no céu." },
    ],
  },
  {
    id: "head",
    title: "Head, Shoulders, Knees and Toes",
    emoji: "🙆",
    lines: [
      { en: "Head, shoulders, knees and toes, knees and toes,", pt: "Cabeça, ombros, joelhos e dedos dos pés," },
      { en: "Head, shoulders, knees and toes, knees and toes,", pt: "Cabeça, ombros, joelhos e dedos dos pés," },
      { en: "And eyes and ears and mouth and nose,", pt: "E olhos e orelhas e boca e nariz," },
      { en: "Head, shoulders, knees and toes, knees and toes.", pt: "Cabeça, ombros, joelhos e dedos dos pés." },
    ],
  },
  {
    id: "shoe",
    title: "One, Two, Buckle My Shoe",
    emoji: "👟",
    lines: [
      { en: "One, two, buckle my shoe,", pt: "Um, dois, afivele meu sapato," },
      { en: "Three, four, shut the door,", pt: "Três, quatro, feche a porta," },
      { en: "Five, six, pick up sticks,", pt: "Cinco, seis, pegue os gravetos," },
      { en: "Seven, eight, lay them straight,", pt: "Sete, oito, deixe-os retinhos," },
      { en: "Nine, ten, a big fat hen!", pt: "Nove, dez, uma galinha gordona!" },
    ],
  },
  {
    id: "rain",
    title: "Rain, Rain, Go Away",
    emoji: "🌧️",
    lines: [
      { en: "Rain, rain, go away,", pt: "Chuva, chuva, vá embora," },
      { en: "Come again another day,", pt: "Volte outro dia," },
      { en: "All the children want to play,", pt: "Todas as crianças querem brincar," },
      { en: "Rain, rain, go away!", pt: "Chuva, chuva, vá embora!" },
    ],
  },
  {
    id: "boat",
    title: "Row, Row, Row Your Boat",
    emoji: "🚣",
    lines: [
      { en: "Row, row, row your boat,", pt: "Reme, reme, reme o seu barco," },
      { en: "Gently down the stream,", pt: "Devagarinho pelo rio," },
      { en: "Merrily, merrily, merrily, merrily,", pt: "Alegremente, alegremente," },
      { en: "Life is but a dream!", pt: "A vida é só um sonho!" },
    ],
  },
];

export interface KidsTopic {
  id: string;
  title: string;
  emoji: string;
  description: string;
  /** Theme given to the AI mascot. */
  scenario: string;
}

// Ids start with "kids-" so the server applies the children's prompt and safety rules.
export const KIDS_TOPICS: KidsTopic[] = [
  {
    id: "kids-animals",
    title: "Animais",
    emoji: "🐶",
    description: "Bichos favoritos e seus sons",
    scenario: "Animals: the child's favorite animals and pets, what animals eat, where they live and the sounds they make.",
  },
  {
    id: "kids-colors",
    title: "Cores",
    emoji: "🎨",
    description: "Cores das coisas ao redor",
    scenario: "Colors: favorite colors and the colors of things the child likes (fruits, toys, animals, the sky).",
  },
  {
    id: "kids-food",
    title: "Comidas",
    emoji: "🍕",
    description: "O que você gosta de comer",
    scenario: "Food: favorite fruits, snacks and meals, and simple likes and dislikes (I like..., I don't like...).",
  },
  {
    id: "kids-play",
    title: "Brincadeiras",
    emoji: "⚽",
    description: "Jogos, brinquedos e esportes",
    scenario: "Playing: favorite toys, games and sports, and what the child likes to play with friends.",
  },
  {
    id: "kids-day",
    title: "Meu dia",
    emoji: "☀️",
    description: "Acordar, comer, brincar, dormir",
    scenario: "My day: simple daily routine (wake up, breakfast, play, bath, sleep) and the weather today.",
  },
];

/** A kids' conversation is shorter than an adult one. */
export const KIDS_SESSION_SECONDS = 3 * 60;

/** Unlocked in this order, one every STARS_PER_STICKER stars. */
export const STICKERS = ["🦄", "🚀", "🌈", "🦖", "🐬", "🍦", "🐙", "🦊", "🐼", "🏰", "🎨", "🪐", "🐉", "🦋", "🎈", "👑"];
export const STARS_PER_STICKER = 10;

/** The mascot, shown as its 3D illustration. */
export const MASCOT = "🦜";
