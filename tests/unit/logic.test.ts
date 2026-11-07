// Fast checks of the rules behind the screens: scoring what was said or typed, XP, streak and lessons.
// Run with `npm run test:unit`.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { normalize, scoreSpeech, scoreTyped, SPEAK_PASS, TYPE_PASS } from "../../src/lib/score";
import { addXp, dayKey, displayStreak, fromSaved, recordLesson, todayXp } from "../../src/lib/progress";
import { buildLesson, type Exercise } from "../../src/data/course";
import { allUnits } from "../../src/data/themes";
import { buildStage, levelFromStages, STAGE_COUNT } from "../../src/data/levels";

describe("pontuação", () => {
  test("contrações e pontuação não contam como erro", () => {
    assert.deepEqual(normalize("I'm fine, thanks!"), ["i", "am", "fine", "thanks"]);
    assert.equal(scoreTyped("I'm fine, thanks!", "i am fine thanks").accuracy, 1);
    assert.equal(scoreTyped("I can't go.", "I cannot go").accuracy, 1);
  });

  test("ditado aceita um erro de digitação em palavra longa, mas não em palavra curta", () => {
    assert.equal(scoreTyped("Nice to meet you", "Nice too meet you").accuracy >= TYPE_PASS, false);
    assert.equal(scoreTyped("Where is the station", "Where is the staton").accuracy, 1);
  });

  test("fala passa com 80% das palavras e usa a melhor alternativa do reconhecimento", () => {
    const s = scoreSpeech("I would like a coffee please", ["banana", "I would like a coffee"]);
    assert.ok(s.accuracy >= SPEAK_PASS);
    assert.equal(s.heard, "I would like a coffee");
    assert.ok(scoreSpeech("I would like a coffee please", ["coffee"]).accuracy < SPEAK_PASS);
    assert.equal(scoreSpeech("Hello", []).accuracy, 0);
  });

  test("marca cada palavra esperada como certa ou errada", () => {
    const s = scoreTyped("Good morning everyone", "good evening everyone");
    assert.deepEqual(
      s.words.map((w) => w.ok),
      [true, false, true],
    );
  });
});

describe("progresso", () => {
  const base = fromSaved(null);

  test("XP soma no dia e a sequência começa em 1", () => {
    const p = addXp(addXp(base, 10), 5);
    assert.equal(p.xp, 15);
    assert.equal(todayXp(p), 15);
    assert.equal(p.streak, 1);
    assert.equal(displayStreak(p), 1);
  });

  test("estudar em dias seguidos aumenta a sequência; pular um dia zera", () => {
    const yesterday = { ...base, streak: 4, lastDay: dayKey(-1) };
    assert.equal(addXp(yesterday, 1).streak, 5);
    const twoDaysAgo = { ...base, streak: 4, lastDay: dayKey(-2) };
    assert.equal(displayStreak(twoDaysAgo), 0);
    assert.equal(addXp(twoDaysAgo, 1).streak, 1);
  });

  test("repetir uma lição guarda a melhor nota", () => {
    const p = recordLesson(recordLesson(base, "hello-escuta", 3, 20), "hello-escuta", 1, 12);
    assert.equal(p.completed["hello-escuta"], 3);
    assert.equal(p.xp, 32);
  });

  test("progresso salvo antes de campos novos continua abrindo", () => {
    const old = fromSaved({ level: "basico", xp: 50 } as never);
    assert.equal(old.mode, "adult");
    assert.equal(old.kids.stars, 0);
    assert.ok(old.aiStyle.accent);
  });
});

describe("conteúdo do curso", () => {
  test("toda unidade (som e temas) monta as três lições sem exercício vazio", () => {
    const filled = (e: Exercise): boolean => {
      switch (e.kind) {
        case "listen_choose":
          return !!e.audio && e.options.length >= 2 && e.options.includes(e.answer);
        case "minimal_pair":
          return !!e.pair?.a && !!e.pair?.b;
        case "respond":
          return !!e.exchange?.q && e.exchange.answers.length > 0;
        default:
          return !!e.phrase?.en && !!e.phrase?.pt;
      }
    };
    for (const unit of allUnits) {
      for (const focus of ["escuta", "fala", "conversa"] as const) {
        const ex = buildLesson({ id: `${unit.id}-${focus}`, unitId: unit.id, title: focus, focus }, allUnits);
        assert.ok(ex.length >= 5, `${unit.id}-${focus}: ${ex.length} exercícios`);
        for (const e of ex) assert.ok(filled(e), `${unit.id}-${focus}: ${JSON.stringify(e)}`);
      }
    }
  });

  test("o nivelamento tem 3 perguntas por etapa e cada etapa vencida sobe um nível", () => {
    for (let s = 0; s < STAGE_COUNT; s++) assert.equal(buildStage(s).length, 3);
    assert.equal(levelFromStages(0), "iniciante");
    assert.equal(levelFromStages(STAGE_COUNT), "avancado");
  });
});
