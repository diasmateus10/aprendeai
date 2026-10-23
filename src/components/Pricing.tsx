import { useState } from "react";
import { CheckCircle, X } from "@phosphor-icons/react";
import { brl, monthlyEquivalent, PLANS, TRIAL_DAYS, yearlySaving, type PlanId } from "../data/plans";
import { startCheckout } from "../lib/account";
import { Mascot } from "./Brand";
import { IconButton } from "./ui";

const BENEFITS = [
  "As 8 unidades do curso, do básico à conversa fluida",
  "Conversa com IA sem limite por dia",
  "Modo Kids completo: todas as rimas e o Kiko à vontade",
  "Correção de pronúncia e flashcards em todas as unidades",
];

/** Plans screen, opened from any Premium lock. `reason` says what the person just tried to do. */
export function Pricing({ reason, hadTrial, onClose }: { reason?: string; hadTrial: boolean; onClose(): void }) {
  const [plan, setPlan] = useState<PlanId>("yearly");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = PLANS.find((p) => p.id === plan)!;
  const per = chosen.interval === "year" ? "por ano" : "por mês";

  const subscribe = async () => {
    setBusy(true);
    setError(null);
    const problem = await startCheckout(plan);
    // On success the page is already going to Stripe.
    if (problem) {
      setError(problem);
      setBusy(false);
    }
  };

  return (
    <div className="pricing">
      <header className="pricing-top">
        <IconButton label="Fechar" onClick={onClose}>
          <X size={22} weight="bold" />
        </IconButton>
      </header>
      <section className="pricing-hero">
        <Mascot mood="happy" size={96} />
        <span className="eyebrow">AprendeAI Premium</span>
        <h1>Fale inglês todo dia, sem limite.</h1>
        {reason && <p className="pricing-reason">{reason}</p>}
      </section>

      <ul className="benefits">
        {BENEFITS.map((b) => (
          <li key={b}>
            <CheckCircle size={22} weight="fill" /> {b}
          </li>
        ))}
      </ul>

      <div className="plans" role="radiogroup" aria-label="Escolha o plano">
        {PLANS.map((p) => (
          <button
            key={p.id}
            role="radio"
            aria-checked={plan === p.id}
            className={`plan ${plan === p.id ? "on" : ""}`}
            onClick={() => setPlan(p.id)}
          >
            {p.interval === "year" && <span className="plan-badge">Economize {yearlySaving()}%</span>}
            <strong>{p.label}</strong>
            <span className="plan-price">
              {brl(p.amount)}
              <small>{p.interval === "year" ? "/ano" : "/mês"}</small>
            </span>
            <span className="hint small">{p.interval === "year" ? `${monthlyEquivalent(p)} por mês` : "Cobrado todo mês"}</span>
          </button>
        ))}
      </div>

      {error && (
        <p className="warn" role="alert">
          {error}
        </p>
      )}
      <button className="btn primary block lg" onClick={subscribe} disabled={busy}>
        {busy ? "Abrindo o pagamento…" : hadTrial ? "Assinar o Premium" : `Começar ${TRIAL_DAYS} dias grátis`}
      </button>
      <p className="hint small pricing-fine">
        {hadTrial
          ? `Você paga ${brl(chosen.amount)} ${per}.`
          : `Você não paga nada hoje. Depois de ${TRIAL_DAYS} dias, ${brl(chosen.amount)} ${per}.`}{" "}
        Cancele quando quiser no menu da conta. Pagamento seguro pelo Stripe.
      </p>
    </div>
  );
}
