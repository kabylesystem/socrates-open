import {
  getDossier,
  listDueDossierCards,
  listDueDossierCardsFor,
} from "@/lib/db";
import { ReviserClient } from "./reviser-client";

// Une flashcard ne vient QUE d'une leçon entamée (cartes au fil des étapes) ou d'une
// ressource ingérée (lien article/X/YouTube déjà vu). Pas de cartes « faits » auto.
function toCard(c: {
  id: number;
  dossier_nom: string;
  question: string;
  reponse: string;
  type: string;
  interval_days: number;
  streak: number;
  ease: number;
}) {
  return {
    id: c.id,
    dossier: c.dossier_nom,
    question: c.question,
    reponse: c.reponse,
    cloze: c.type === "cloze",
    interval: c.interval_days,
    streak: c.streak,
    ease: c.ease,
  };
}

// Mélange (Fisher-Yates) : chaque session de révision bat les cartes.
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default async function ReviserPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const { d } = await searchParams;

  // Mode « réviser ce sujet » : uniquement les flashcards du dossier.
  if (d) {
    const dossier = getDossier(d);
    const cards = dossier ? shuffle(listDueDossierCardsFor(dossier.id).map(toCard)) : [];
    return (
      <div className="px-6 py-10 md:px-12 lg:px-16">
        <header className="border-b border-border pb-8">
          <h1 className="text-balance font-serif text-6xl tracking-tight lg:text-7xl">
            Réviser
          </h1>
          <p className="mt-3 text-[15px] text-muted-foreground">
            {dossier?.nom ?? d} :{" "}
            {cards.length > 0
              ? `${cards.length} carte${cards.length > 1 ? "s" : ""} à revoir.`
              : "rien à revoir pour l'instant, reviens plus tard."}
          </p>
        </header>
        <ReviserClient cards={cards} />
      </div>
    );
  }

  const cards = shuffle(listDueDossierCards(60).map(toCard));

  return (
    <div className="px-6 py-10 md:px-12 lg:px-16">
      <header className="border-b border-border pb-8">
        <h1 className="text-balance font-serif text-6xl tracking-tight lg:text-7xl">
          Réviser
        </h1>
        <p className="mt-3 text-[15px] text-muted-foreground">
          {cards.length > 0
            ? `${cards.length} carte${cards.length > 1 ? "s" : ""} à revoir aujourd'hui.`
            : "Rien à réviser. Avance dans une leçon ou ingère un lien pour créer des flashcards."}
        </p>
      </header>
      <ReviserClient cards={cards} />
    </div>
  );
}
