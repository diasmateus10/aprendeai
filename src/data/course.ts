// Course for Brazilian Portuguese speakers learning English, built around listening and speaking.
// Each unit targets a sound or situation that is typically hard for native PT-BR speakers.

export interface Phrase {
  en: string;
  pt: string;
  /** Pronunciation hint in Portuguese, shown on speaking exercises. */
  tip?: string;
}

export interface MinimalPair {
  a: string;
  b: string;
  ptA: string;
  ptB: string;
}

export interface Exchange {
  /** Question the learner hears. */
  q: string;
  qPt: string;
  /** Any of these spoken answers is accepted; the first is shown as the model answer. */
  answers: string[];
  answerPt: string;
}

export interface Unit {
  id: string;
  title: string;
  subtitle: string;
  color: string;
  /** Short lesson in Portuguese explaining the sound or situation. */
  guide: string[];
  phrases: Phrase[];
  pairs: MinimalPair[];
  exchanges: Exchange[];
}

export type Exercise =
  | { kind: "listen_choose"; audio: string; options: string[]; answer: string }
  | { kind: "minimal_pair"; pair: MinimalPair; play: "a" | "b" }
  | { kind: "dictation"; phrase: Phrase }
  | { kind: "repeat"; phrase: Phrase }
  | { kind: "speak_translate"; phrase: Phrase }
  | { kind: "respond"; exchange: Exchange };

export interface Lesson {
  id: string;
  unitId: string;
  title: string;
  focus: "escuta" | "fala" | "conversa";
}

export const units: Unit[] = [
  {
    id: "hello",
    title: "Primeiras palavras",
    subtitle: "Cumprimentos e o H aspirado",
    color: "#3dd6c6",
    guide: [
      "Em inglês, o H no começo da palavra é pronunciado: é um sopro leve, como o 'rr' de 'carro' bem suave.",
      "'Hello' soa 'rrélou', não 'élou'. 'Hi' soa 'rrai'.",
      "Atenção: 'how' (como) e 'who' (quem) também começam com esse sopro.",
    ],
    phrases: [
      { en: "Hi, how are you?", pt: "Oi, como vai?", tip: "H com sopro: 'rrai, rrau ar iu'" },
      { en: "I'm fine, thanks.", pt: "Estou bem, obrigado.", tip: "'fine' termina em N sem virar 'fáini'" },
      { en: "Nice to meet you.", pt: "Prazer em te conhecer.", tip: "'meet you' se junta: 'mítchu'" },
      { en: "My name is Ana.", pt: "Meu nome é Ana." },
      { en: "Have a good day.", pt: "Tenha um bom dia.", tip: "'have' com H soprado e V no final" },
      { en: "See you later.", pt: "Até mais tarde." },
    ],
    pairs: [
      { a: "hat", b: "at", ptA: "chapéu", ptB: "em / no" },
      { a: "heat", b: "eat", ptA: "calor", ptB: "comer" },
      { a: "hair", b: "air", ptA: "cabelo", ptB: "ar" },
    ],
    exchanges: [
      { q: "How are you?", qPt: "Como vai você?", answers: ["I'm fine thanks", "I'm good", "I'm fine", "I'm great", "I'm ok"], answerPt: "Estou bem, obrigado." },
      { q: "What's your name?", qPt: "Qual é o seu nome?", answers: ["My name is", "I'm"], answerPt: "Meu nome é ..." },
    ],
  },
  {
    id: "th",
    title: "O som do TH",
    subtitle: "think, this, thank you",
    color: "#b58cff",
    guide: [
      "O TH não existe em português. Coloque a ponta da língua entre os dentes e sopre.",
      "TH 'surdo' (think, three, thank): só ar, sem vibrar a garganta. Não é 'f', nem 's', nem 't'.",
      "TH 'sonoro' (this, the, mother): mesma posição, mas com a garganta vibrando. Não é 'd'.",
    ],
    phrases: [
      { en: "Thank you very much.", pt: "Muito obrigado.", tip: "Língua entre os dentes no 'th'" },
      { en: "I think so.", pt: "Acho que sim.", tip: "'think', não 'tink' nem 'fink'" },
      { en: "This is my brother.", pt: "Este é meu irmão.", tip: "'this' e 'brother' com TH sonoro" },
      { en: "There are three things.", pt: "Há três coisas.", tip: "'three' não é 'tree' (árvore)" },
      { en: "What's the weather like?", pt: "Como está o tempo?" },
      { en: "My mother is at the theater.", pt: "Minha mãe está no teatro." },
    ],
    pairs: [
      { a: "think", b: "sink", ptA: "pensar", ptB: "pia" },
      { a: "three", b: "tree", ptA: "três", ptB: "árvore" },
      { a: "they", b: "day", ptA: "eles", ptB: "dia" },
      { a: "thank", b: "tank", ptA: "agradecer", ptB: "tanque" },
      { a: "path", b: "pass", ptA: "caminho", ptB: "passar" },
    ],
    exchanges: [
      { q: "Do you think it will rain?", qPt: "Você acha que vai chover?", answers: ["I think so", "I don't think so", "Yes I think so", "No I don't think so"], answerPt: "Acho que sim." },
      { q: "Who is this?", qPt: "Quem é este?", answers: ["This is my brother", "This is my friend", "This is my mother"], answerPt: "Este é meu irmão." },
    ],
  },
  {
    id: "vowels",
    title: "Vogais curtas e longas",
    subtitle: "ship × sheep, live × leave",
    color: "#ffc24b",
    guide: [
      "Inglês diferencia vogais curtas e longas, e isso muda o sentido da palavra.",
      "'ee' longo (sheep, leave): um 'i' esticado, sorrindo. 'i' curto (ship, live): um 'i' relaxado, quase 'ê'.",
      "'oo' longo (pool, food) é mais longo que 'u' curto (pull, good).",
    ],
    phrases: [
      { en: "I live in Brazil.", pt: "Eu moro no Brasil.", tip: "'live' com i curto e relaxado" },
      { en: "Please leave the room.", pt: "Por favor, saia da sala.", tip: "'leave' e 'please' com i longo" },
      { en: "The food is good.", pt: "A comida é boa.", tip: "'food' longo, 'good' curto" },
      { en: "Can you fill the cup?", pt: "Você pode encher o copo?" },
      { en: "I need to sleep.", pt: "Preciso dormir.", tip: "'need' e 'sleep' bem longos" },
      { en: "It is a big ship.", pt: "É um navio grande." },
    ],
    pairs: [
      { a: "ship", b: "sheep", ptA: "navio", ptB: "ovelha" },
      { a: "live", b: "leave", ptA: "viver", ptB: "partir" },
      { a: "full", b: "fool", ptA: "cheio", ptB: "tolo" },
      { a: "fill", b: "feel", ptA: "encher", ptB: "sentir" },
      { a: "bit", b: "beat", ptA: "pedaço", ptB: "bater" },
    ],
    exchanges: [
      { q: "Where do you live?", qPt: "Onde você mora?", answers: ["I live in Brazil", "I live in", "In Brazil"], answerPt: "Eu moro no Brasil." },
      { q: "Are you tired?", qPt: "Você está cansado?", answers: ["Yes I need to sleep", "Yes I am", "No I'm not", "A little"], answerPt: "Sim, preciso dormir." },
    ],
  },
  {
    id: "endings",
    title: "Finais sem 'i' extra",
    subtitle: "big, like, Facebook",
    color: "#ff6b4a",
    guide: [
      "Brasileiros costumam colocar um 'i' depois de consoantes finais: 'bigui', 'laiki', 'feicibuqui'.",
      "Em inglês a palavra termina seca na consoante: 'big', 'like', 'book'.",
      "Dica: segure a última consoante e pare. Não solte a vogal.",
    ],
    phrases: [
      { en: "I like this book.", pt: "Eu gosto deste livro.", tip: "'like' e 'book' terminam secos" },
      { en: "It's a big dog.", pt: "É um cachorro grande.", tip: "'big' e 'dog' sem 'i' no final" },
      { en: "Stop and look.", pt: "Pare e olhe.", tip: "'stop' começa em S, não 'istop'" },
      { en: "I want a hot drink.", pt: "Quero uma bebida quente." },
      { en: "Check your email.", pt: "Confira seu e-mail.", tip: "'check' termina em K seco" },
      { en: "School starts at eight.", pt: "A escola começa às oito.", tip: "Nada de 'iscool' nem 'istarts'" },
    ],
    pairs: [
      { a: "cap", b: "cab", ptA: "boné", ptB: "táxi" },
      { a: "back", b: "bag", ptA: "costas", ptB: "bolsa" },
      { a: "bed", b: "bet", ptA: "cama", ptB: "aposta" },
      { a: "eyes", b: "ice", ptA: "olhos", ptB: "gelo" },
    ],
    exchanges: [
      { q: "What do you want to drink?", qPt: "O que você quer beber?", answers: ["I want a hot drink", "Water please", "Coffee please", "A coffee please", "I want water"], answerPt: "Quero uma bebida quente." },
      { q: "Do you like dogs?", qPt: "Você gosta de cachorros?", answers: ["Yes I like dogs", "Yes I do", "No I don't", "I love dogs"], answerPt: "Sim, eu gosto de cachorros." },
    ],
  },
  {
    id: "r-l",
    title: "R e L do inglês",
    subtitle: "red, right, world, people",
    color: "#5b8cff",
    guide: [
      "O R inglês não vibra e não é o 'rr' de 'rato'. A língua curva para trás sem tocar em nada: 'red', 'right'.",
      "O L no fim da palavra não vira 'u': 'people' não é 'pípou', 'milk' não é 'miuk'. A ponta da língua toca atrás dos dentes.",
      "Em 'world', 'girl', 'early' o R e o L se encontram: vá devagar.",
    ],
    phrases: [
      { en: "Turn right at the red light.", pt: "Vire à direita no sinal vermelho.", tip: "R sem vibrar, L com língua nos dentes" },
      { en: "I'd like some milk.", pt: "Eu gostaria de um pouco de leite.", tip: "'milk' com L de verdade" },
      { en: "People around the world.", pt: "Pessoas ao redor do mundo." },
      { en: "It's really cold.", pt: "Está muito frio.", tip: "'really' e 'cold' — L final não vira U" },
      { en: "I read a lot.", pt: "Eu leio muito." },
      { en: "The girl is early.", pt: "A menina está adiantada." },
    ],
    pairs: [
      { a: "right", b: "light", ptA: "direita", ptB: "luz" },
      { a: "read", b: "lead", ptA: "ler", ptB: "liderar" },
      { a: "fly", b: "fry", ptA: "voar", ptB: "fritar" },
      { a: "collect", b: "correct", ptA: "coletar", ptB: "corrigir" },
    ],
    exchanges: [
      { q: "Is it cold today?", qPt: "Está frio hoje?", answers: ["It's really cold", "Yes it's cold", "Yes it is", "No it's warm", "No it isn't"], answerPt: "Está muito frio." },
      { q: "Where is the bank?", qPt: "Onde fica o banco?", answers: ["Turn right at the red light", "Turn right", "Turn left", "It's over there"], answerPt: "Vire à direita no sinal vermelho." },
    ],
  },
  {
    id: "cafe",
    title: "No café",
    subtitle: "Pedir, pagar e agradecer",
    color: "#4ade9a",
    guide: [
      "Para pedir com educação use 'Can I have...' ou 'I'd like...'. Evite 'I want', que soa direto demais.",
      "'Could I get the check?' é a forma natural de pedir a conta nos EUA.",
      "Repare no ritmo: palavras importantes são fortes, as pequenas (a, of, the) quase somem.",
    ],
    phrases: [
      { en: "Can I have a coffee, please?", pt: "Pode me dar um café, por favor?", tip: "'Can I' se junta: 'kê-nai'" },
      { en: "I'd like a glass of water.", pt: "Eu gostaria de um copo de água.", tip: "'glass of' vira 'glé-sôv'" },
      { en: "For here or to go?", pt: "Para comer aqui ou para viagem?" },
      { en: "To go, please.", pt: "Para viagem, por favor." },
      { en: "Could I get the check?", pt: "Pode trazer a conta?" },
      { en: "Can I pay by card?", pt: "Posso pagar com cartão?" },
    ],
    pairs: [
      { a: "cup", b: "cap", ptA: "xícara", ptB: "boné" },
      { a: "tea", b: "T", ptA: "chá", ptB: "letra T" },
      { a: "card", b: "cart", ptA: "cartão", ptB: "carrinho" },
    ],
    exchanges: [
      { q: "What can I get for you?", qPt: "O que vai querer?", answers: ["Can I have a coffee please", "I'd like a coffee", "A coffee please", "I'd like a glass of water"], answerPt: "Pode me dar um café, por favor?" },
      { q: "For here or to go?", qPt: "Para comer aqui ou para viagem?", answers: ["To go please", "For here please", "To go", "For here"], answerPt: "Para viagem, por favor." },
      { q: "How would you like to pay?", qPt: "Como gostaria de pagar?", answers: ["By card please", "Can I pay by card", "Card please", "Cash please"], answerPt: "Com cartão, por favor." },
    ],
  },
  {
    id: "travel",
    title: "Viagem",
    subtitle: "Aeroporto, hotel e direções",
    color: "#ff8fb1",
    guide: [
      "Na imigração, respostas curtas e claras são o ideal: 'For vacation', 'Two weeks'.",
      "Para pedir ajuda: 'Excuse me, could you help me?' funciona em qualquer situação.",
      "Se não entender, peça: 'Could you say that again, please?' ou 'Could you speak more slowly?'",
    ],
    phrases: [
      { en: "Excuse me, could you help me?", pt: "Com licença, você pode me ajudar?", tip: "'could you' vira 'cúdju'" },
      { en: "I have a reservation.", pt: "Eu tenho uma reserva.", tip: "H soprado em 'have'" },
      { en: "Where is the bathroom?", pt: "Onde fica o banheiro?", tip: "TH em 'bathroom'" },
      { en: "I'm here on vacation.", pt: "Estou aqui de férias." },
      { en: "Could you speak more slowly?", pt: "Você pode falar mais devagar?" },
      { en: "How much is a ticket?", pt: "Quanto custa uma passagem?" },
    ],
    pairs: [
      { a: "walk", b: "work", ptA: "caminhar", ptB: "trabalhar" },
      { a: "gate", b: "get", ptA: "portão", ptB: "pegar" },
      { a: "sixty", b: "sixteen", ptA: "sessenta", ptB: "dezesseis" },
      { a: "thirty", b: "thirteen", ptA: "trinta", ptB: "treze" },
    ],
    exchanges: [
      { q: "What is the purpose of your visit?", qPt: "Qual o motivo da sua visita?", answers: ["I'm here on vacation", "Vacation", "For vacation", "Tourism", "Business"], answerPt: "Estou aqui de férias." },
      { q: "How long will you stay?", qPt: "Quanto tempo vai ficar?", answers: ["Two weeks", "One week", "Ten days", "A month", "One month"], answerPt: "Duas semanas." },
      { q: "Do you have a reservation?", qPt: "Você tem reserva?", answers: ["Yes I have a reservation", "Yes I do", "No I don't"], answerPt: "Sim, eu tenho uma reserva." },
    ],
  },
  {
    id: "linking",
    title: "Inglês falado de verdade",
    subtitle: "wanna, gonna, whaddaya",
    color: "#ff9f5a",
    guide: [
      "Nativos juntam palavras: 'want to' vira 'wanna', 'going to' vira 'gonna'.",
      "'What do you' vira 'whaddaya'; 'did you' vira 'didja'.",
      "Você não precisa falar assim, mas precisa entender. Use o botão lento para ouvir cada palavra.",
    ],
    phrases: [
      { en: "What do you want to do?", pt: "O que você quer fazer?", tip: "Soa 'whaddaya wanna do'" },
      { en: "I'm going to call you.", pt: "Vou te ligar.", tip: "Soa 'I'm gonna call ya'" },
      { en: "Did you eat yet?", pt: "Você já comeu?", tip: "Soa 'didja eat yet'" },
      { en: "Let me know.", pt: "Me avisa.", tip: "Soa 'lemme know'" },
      { en: "I don't know.", pt: "Não sei.", tip: "Soa 'I dunno'" },
      { en: "Give me a minute.", pt: "Me dá um minuto.", tip: "Soa 'gimme a minute'" },
    ],
    pairs: [
      { a: "can", b: "can't", ptA: "pode", ptB: "não pode" },
      { a: "want", b: "won't", ptA: "querer", ptB: "não vai" },
      { a: "walk", b: "woke", ptA: "caminhar", ptB: "acordou" },
    ],
    exchanges: [
      { q: "What do you want to do tonight?", qPt: "O que você quer fazer hoje à noite?", answers: ["I don't know", "Let's watch a movie", "I want to go out", "I want to stay home"], answerPt: "Não sei." },
      { q: "Did you eat yet?", qPt: "Você já comeu?", answers: ["Not yet", "Yes I did", "No I didn't", "Yes I ate"], answerPt: "Ainda não." },
    ],
  },
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function listenChoose(p: Phrase, pool: Phrase[]): Exercise {
  const wrong = shuffle(pool.filter((x) => x !== p)).slice(0, 3).map((x) => x.pt);
  return { kind: "listen_choose", audio: p.en, answer: p.pt, options: shuffle([p.pt, ...wrong]) };
}

function pairEx(pair: MinimalPair): Exercise {
  return { kind: "minimal_pair", pair, play: Math.random() < 0.5 ? "a" : "b" };
}

/** `pool`: every unit a lesson can come from (the path's units), for the wrong options. */
export function buildLesson(lesson: Lesson, pool: Unit[]): Exercise[] {
  const unit = pool.find((u) => u.id === lesson.unitId)!;
  const allPhrases = pool.flatMap((u) => u.phrases);
  const ph = shuffle(unit.phrases);
  const pairs = shuffle(unit.pairs);

  switch (lesson.focus) {
    case "escuta":
      return [
        listenChoose(ph[0], allPhrases),
        pairEx(pairs[0]),
        { kind: "dictation", phrase: ph[1] },
        listenChoose(ph[2], allPhrases),
        pairEx(pairs[1 % pairs.length]),
        { kind: "dictation", phrase: ph[3] },
        pairEx(pairs[2 % pairs.length]),
        listenChoose(ph[4], allPhrases),
      ];
    case "fala":
      return [
        { kind: "repeat", phrase: ph[0] },
        { kind: "repeat", phrase: ph[1] },
        pairEx(pairs[0]),
        { kind: "speak_translate", phrase: ph[2] },
        { kind: "repeat", phrase: ph[3] },
        { kind: "speak_translate", phrase: ph[4] },
        { kind: "repeat", phrase: ph[5] },
      ];
    case "conversa": {
      const ex = shuffle(unit.exchanges);
      return shuffle<Exercise>([
        ...ex.map((e) => ({ kind: "respond" as const, exchange: e })),
        { kind: "speak_translate", phrase: ph[0] },
        { kind: "dictation", phrase: ph[1] },
        listenChoose(ph[2], allPhrases),
        { kind: "repeat", phrase: ph[3] },
      ]);
    }
  }
}
