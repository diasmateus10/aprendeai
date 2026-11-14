// "Fale sobre qualquer coisa": what the partner rereads from the learner's past free conversations to open the next
// one with subjects from them (server/history.ts). Run with `npm run test:unit`.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatFreeMemory, type PastSession } from "../../server/history";

const DAY = 86_400_000;
const now = Date.parse("2026-11-14T12:00:00Z");
const ago = (days: number) => new Date(now - days * DAY).toISOString();

const trip: PastSession = {
  started_at: ago(3),
  messages: [
    { role: "assistant", content: "Hi! What do you want to talk about today?" },
    { role: "user", content: "i want talk about my trip to portugal in december" },
    { role: "assistant", content: "Oh, nice! Who are you going with?\n💡 \"i want talk\" → \"I want to talk\" (want pede to)" },
    { role: "user", content: "with my wife we go to lisbon and porto" },
  ],
};

describe("memória do Fale sobre qualquer coisa", () => {
  test("sem conversas, ou só com a abertura da IA, não há memória", () => {
    assert.equal(formatFreeMemory([], now), "");
    assert.equal(formatFreeMemory([{ started_at: ago(1), messages: [{ role: "assistant", content: "Hi! What shall we talk about?" }] }], now), "");
  });

  test("traz o que foi conversado, quando, e deixa a correção 💡 de fora", () => {
    const memory = formatFreeMemory([trip], now);
    assert.match(memory, /^Conversation 3 days ago:/);
    assert.match(memory, /Learner: i want talk about my trip to portugal in december/);
    assert.match(memory, /You: Oh, nice! Who are you going with\?/);
    assert.match(memory, /Learner: with my wife we go to lisbon and porto/);
    assert.doesNotMatch(memory, /💡|want pede to/);
  });

  test("mais recentes primeiro, e a abertura anterior aparece para a IA não repetir as mesmas sugestões", () => {
    const work: PastSession = {
      started_at: ago(0),
      messages: [
        { role: "assistant", content: "Hey! Last time you told me about Portugal. Want to talk about that, or your work?" },
        { role: "user", content: "my new job as a designer" },
      ],
    };
    const memory = formatFreeMemory([work, trip], now);
    assert.ok(memory.indexOf("Conversation today") < memory.indexOf("Conversation 3 days ago"));
    assert.match(memory, /You: Hey! Last time you told me about Portugal/);
  });

  test("conversas longas são cortadas para não pesar a abertura", () => {
    const long: PastSession = {
      started_at: ago(2),
      messages: Array.from({ length: 60 }, (_, i) => ({
        role: (i % 2 ? "user" : "assistant") as "user" | "assistant",
        content: `line ${i} ${"word ".repeat(80)}`,
      })),
    };
    const memory = formatFreeMemory(Array.from({ length: 8 }, () => long), now);
    assert.ok(memory.length <= 6000 + 1300, `memory has ${memory.length} chars`);
    for (const block of memory.split("\n\n")) assert.ok(block.length <= 1210, `block has ${block.length} chars`);
  });
});
