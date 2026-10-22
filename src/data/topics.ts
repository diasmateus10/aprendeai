// Conversation topics for the AI speaking practice. Shared by the UI and the server prompt.

export interface Topic {
  id: string;
  title: string;
  emoji: string;
  description: string;
  /** Scenario given to the AI partner. */
  scenario: string;
}

export const TOPICS: Topic[] = [
  {
    id: "free",
    title: "Fale sobre qualquer coisa",
    emoji: "💭",
    description: "Você escolhe o assunto",
    scenario:
      "Free conversation: the learner picks the subject. Open with a short greeting and ask what they want to talk about today, without suggesting a topic. Then follow whatever subject they bring up, and let them change it at any time.",
  },
  { id: "intro", title: "Se apresentar", emoji: "👋", description: "Nome, cidade, trabalho e hobbies", scenario: "You just met the learner at a meetup for international friends. Get to know them: name, where they live, work or studies, hobbies." },
  { id: "cafe", title: "No café", emoji: "☕", description: "Pedir, perguntar preço e pagar", scenario: "You are a barista at a coffee shop in New York. Take the learner's order, suggest items, tell prices and handle payment." },
  { id: "airport", title: "Aeroporto", emoji: "✈️", description: "Check-in e imigração", scenario: "You are an immigration officer at a US airport. Ask the learner about the purpose of their trip, how long they will stay and where they will stay." },
  { id: "hotel", title: "Hotel", emoji: "🏨", description: "Reserva, quarto e problemas", scenario: "You are a hotel receptionist. Help the learner check in, explain breakfast and Wi-Fi, and solve a small problem with their room." },
  { id: "directions", title: "Pedir direções", emoji: "🗺️", description: "Se localizar na cidade", scenario: "You are a local on the street in London. The learner is lost and asks for directions; give simple directions and recommend places nearby." },
  { id: "interview", title: "Entrevista de emprego", emoji: "💼", description: "Falar de experiência e objetivos", scenario: "You are a friendly recruiter interviewing the learner for a job at an international company. Ask about experience, strengths and goals." },
  { id: "doctor", title: "No médico", emoji: "🩺", description: "Explicar sintomas", scenario: "You are a doctor at a clinic. Ask the learner how they feel, about their symptoms and give simple advice." },
  { id: "weekend", title: "Fim de semana", emoji: "🎉", description: "Papo livre sobre lazer", scenario: "You are the learner's English-speaking coworker on Monday morning. Chat casually about what you both did over the weekend and plans for next weekend." },
];

/** A conversation session lasts at most this long. */
export const SESSION_SECONDS = 5 * 60;
