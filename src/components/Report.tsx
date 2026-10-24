// Weekly progress report (Premium), written every Sunday from the week's AI conversations (server/reports.ts).

import { ArrowLeft, ArrowRight, ChatsCircle, Clock, Microphone, Target, TrendUp, Warning } from "@phosphor-icons/react";
import type { ProgressReport } from "../lib/account";

export function ReportScreen({ report, onExit }: { report: ProgressReport; onExit(): void }) {
  const r = report.report;
  const week = new Date(`${report.week_start}T12:00:00`).toLocaleDateString("pt-BR", { day: "numeric", month: "long" });
  return (
    <div className="page report-page">
      <header className="page-top">
        <button className="close" onClick={onExit} aria-label="Voltar">
          <ArrowLeft size={22} weight="bold" />
        </button>
        <h1>Relatório da semana</h1>
      </header>
      <p className="hint">Semana de {week}</p>
      <h2 className="report-headline">{r.headline}</h2>

      <section className="numbers report-numbers" aria-label="Sua semana">
        <div>
          <ChatsCircle size={22} weight="fill" className="coral" />
          <strong>{r.stats.conversations}</strong>
          <span>{r.stats.conversations === 1 ? "conversa" : "conversas"}</span>
        </div>
        <div>
          <Clock size={22} weight="fill" className="gold" />
          <strong>{r.stats.minutes}</strong>
          <span>min conversando</span>
        </div>
        <div>
          <Microphone size={22} weight="fill" className="coral" />
          <strong>{r.stats.lines}</strong>
          <span>frases faladas</span>
        </div>
      </section>

      {r.improved.length > 0 && (
        <section className="card report-section">
          <h3>
            <TrendUp size={20} weight="bold" className="gold" /> O que melhorou
          </h3>
          <ul>
            {r.improved.map((p) => (
              <li key={p.point}>
                <strong>{p.point}</strong>
                <span className="report-change">
                  {p.before && (
                    <>
                      <em>“{p.before}”</em> <ArrowRight size={14} weight="bold" />
                    </>
                  )}
                  <em>“{p.now}”</em>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card report-section">
        <h3>
          <Warning size={20} weight="bold" className="coral" /> Para treinar
        </h3>
        <ul>
          {r.focus.map((p) => (
            <li key={p.point}>
              <strong>{p.point}</strong>
              <span>{p.tip}</span>
              {p.example && <em className="report-example">{p.example}</em>}
            </li>
          ))}
        </ul>
      </section>

      <section className="card report-section report-goal">
        <h3>
          <Target size={20} weight="bold" className="gold" /> Meta da próxima semana
        </h3>
        <p>{r.next_goal}</p>
      </section>
    </div>
  );
}
