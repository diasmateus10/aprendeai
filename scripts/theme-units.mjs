// Generates the theme units of the personalized path (src/data/theme-units.json) with Claude, once;
// the result is reviewed and committed, so the app never calls the AI for course content.
// Usage: node scripts/theme-units.mjs            (all missing themes)
//        node scripts/theme-units.mjs theme=games (regenerate one theme)

import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";

const OUT = new URL("../src/data/theme-units.json", import.meta.url);
const MODEL = "claude-opus-5-5";

// Each theme gets two units; "comida" and "viagem" reuse the course's café and travel units as their first.
const THEMES = {
  comida: ["No restaurante: reserva, cardápio, alergias, elogiar e reclamar do prato"],
  viagem: ["Passeios: pontos turísticos, ingressos, tirar foto, transporte público"],
  trabalho: ["No escritório: reuniões, e-mails, prazos, pedir ajuda a colegas", "Entrevista de emprego: experiência, pontos fortes, objetivos"],
  tecnologia: ["Tecnologia no dia a dia: celular, apps, internet, senha, problemas técnicos", "Falar de trabalho com tecnologia: software, dados, IA, explicar um projeto"],
  esportes: ["Futebol: times, jogos, placar, torcer, assistir no bar", "Academia e esportes: treino, corrida, lesões, campeonatos"],
  filmes: ["Filmes e séries: gêneros, recomendar, opinar, sem spoilers", "Cinema e streaming: comprar ingresso, legendas, maratonar séries"],
  musica: ["Música: estilos, artistas favoritos, playlists, instrumentos", "Shows e festivais: ingressos, line-up, fila, cantar junto"],
  compras: ["Compras em loja: tamanho, provador, preço, troca e devolução", "Compras online e mercado: entrega, rastreio, supermercado, promoções"],
  saude: ["No médico e na farmácia: sintomas, remédios, consulta", "Bem-estar: sono, alimentação, estresse, rotina saudável"],
  familia: ["Família: parentes, apresentar a família, idades, profissões", "Casa e rotina: cômodos, tarefas domésticas, rotina diária"],
  social: ["Fazer amigos: se apresentar, convites, combinar um encontro", "Vida social: festas, bares, conversa fiada (small talk), despedidas"],
  negocios: ["Dinheiro e banco: conta, cartão, transferência, câmbio, orçamento", "Negócios: negociar, apresentar uma ideia, clientes, fechar acordo"],
  games: ["Games: gêneros, plataformas, jogar online, chat de voz", "Comunidade gamer: streams, torneios, gírias de jogo, trabalho em equipe"],
  natureza: ["Natureza e animais: bichos de estimação, parques, clima e tempo", "Ao ar livre: trilha, praia, acampamento, meio ambiente"],
  estudos: ["Estudos: faculdade, matérias, provas, rotina de estudos", "Intercâmbio: escola de idiomas, morar fora, colegas de quarto"],
};

const COLORS = ["#3dd6c6", "#b58cff", "#ffc24b", "#ff6b4a", "#5b8cff", "#4ade9a", "#ff8fb1", "#ff9f5a"];

const EXAMPLE = {
  id: "cafe",
  title: "No café",
  subtitle: "Pedir, pagar e agradecer",
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
    { q: "What can I get for you?", qPt: "O que vai querer?", answers: ["Can I have a coffee please", "I'd like a coffee", "A coffee please"], answerPt: "Pode me dar um café, por favor?" },
    { q: "For here or to go?", qPt: "Para comer aqui ou para viagem?", answers: ["To go please", "For here please", "To go", "For here"], answerPt: "Para viagem, por favor." },
    { q: "How would you like to pay?", qPt: "Como gostaria de pagar?", answers: ["By card please", "Can I pay by card", "Card please", "Cash please"], answerPt: "Com cartão, por favor." },
  ],
};

const SYSTEM = `You write units for an English course for native Brazilian Portuguese speakers, focused on listening and speaking real, natural English.
A unit has: a short title and subtitle in Brazilian Portuguese; a "guide" of exactly 3 short tips in Brazilian Portuguese (useful expressions, cultural notes, or a pronunciation point typical for Brazilians); exactly 6 phrases (natural, everyday, 3 to 8 words each, useful in the situation, levels mixed from basic to intermediate) with a Portuguese translation and, for at least 3 of them, a pronunciation tip written for Brazilians (how it sounds, using Portuguese spelling, e.g. 'could you' vira 'cúdju'); exactly 3 minimal pairs of real English words related to the theme where possible, contrasting sounds Brazilians confuse (short/long vowels, TH, final consonants, R/L, H, -ed, etc.), with Portuguese meanings; and exactly 3 exchanges: a question the learner hears, its translation, 3 to 5 short accepted spoken answers WITHOUT punctuation (the speech recognizer drops it; contractions written like I'm, don't), and the Portuguese translation of the first answer.
Phrases must be distinct across the units you write. No brand names. No content inappropriate for teenagers.
Answer with only a JSON array of units, no markdown, each unit in exactly this shape (no "color" field): ${JSON.stringify(EXAMPLE)}`;

function valid(u) {
  const str = (s) => typeof s === "string" && s.trim().length > 0;
  return (
    /^[a-z0-9-]+$/.test(u.id) && str(u.title) && str(u.subtitle) &&
    Array.isArray(u.guide) && u.guide.length === 3 && u.guide.every(str) &&
    Array.isArray(u.phrases) && u.phrases.length === 6 && u.phrases.every((p) => str(p.en) && str(p.pt) && (p.tip === undefined || str(p.tip))) &&
    Array.isArray(u.pairs) && u.pairs.length === 3 && u.pairs.every((p) => str(p.a) && str(p.b) && str(p.ptA) && str(p.ptB) && p.a !== p.b) &&
    Array.isArray(u.exchanges) && u.exchanges.length === 3 &&
    u.exchanges.every((e) => str(e.q) && str(e.qPt) && str(e.answerPt) && Array.isArray(e.answers) && e.answers.length >= 3 && e.answers.every((a) => str(a) && !/[.,!?]/.test(a)))
  );
}

const env = Object.fromEntries(
  fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
const out = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
const only = process.argv.find((a) => a.startsWith("theme="))?.slice(6);
const todo = Object.keys(THEMES).filter((t) => (only ? t === only : !out[t]));

async function generate(theme) {
  const specs = THEMES[theme];
  const ids = specs.map((_, i) => `${theme}-${specs.length === 1 ? 2 : i + 1}`);
  const ask = specs.map((s, i) => `Unit id "${ids[i]}": ${s}`).join("\n");
  for (let attempt = 1; attempt <= 3; attempt++) {
    const msg = await client.messages.create({ model: MODEL, max_tokens: 8000, system: SYSTEM, messages: [{ role: "user", content: `Write ${specs.length} unit(s) for the theme "${theme}":\n${ask}` }] });
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    try {
      const units = JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1));
      if (units.length === specs.length && units.every(valid)) {
        return units.map((u, i) => ({ ...u, id: ids[i], color: COLORS[(Object.keys(THEMES).indexOf(theme) * 2 + i) % COLORS.length] }));
      }
      console.warn(`${theme}: invalid shape (attempt ${attempt})`);
    } catch {
      console.warn(`${theme}: bad JSON (attempt ${attempt})`);
    }
  }
  throw new Error(`${theme}: failed`);
}

// A few at a time, saving after each theme.
for (let i = 0; i < todo.length; i += 5) {
  await Promise.all(
    todo.slice(i, i + 5).map(async (t) => {
      out[t] = await generate(t);
      fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
      console.log(`ok ${t}: ${out[t].map((u) => u.title).join(" | ")}`);
    }),
  );
}
