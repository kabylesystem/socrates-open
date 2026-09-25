"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  actionDeleteDossierCard,
  actionGradeDossierCard,
  actionRestoreDossierCard,
} from "@/app/actions";

type Card = {
  id: number;
  dossier: string;
  question: string;
  reponse: string;
  cloze: boolean;
  interval: number;
  streak: number;
  ease: number;
};

// SM-2 côté client : sert UNIQUEMENT à afficher l'intervalle projeté sous chaque
// bouton (la vraie mise à jour se fait côté serveur). Doit rester aligné avec sm2()
// de lib/db.ts. q : 0 raté, 1 dur, 2 bien, 3 facile.
function projeter(c: Card, q: number): number {
  if (q <= 0) return 0;
  let e = c.ease || 2.5;
  if (q === 1) e = Math.max(1.3, e - 0.15);
  if (q === 3) e = e + 0.15;
  const s = c.streak + 1;
  if (s === 1) return q === 3 ? 4 : 1;
  if (s === 2) return q === 3 ? 6 : 3;
  const mult = q === 1 ? 1.2 : q === 3 ? e * 1.3 : e;
  return Math.max(1, c.interval * mult);
}

function formatJours(j: number): string {
  if (j < 1) return "bientôt";
  if (j < 45) return `${Math.round(j)} j`;
  if (j < 330) return `${Math.round(j / 30)} mois`;
  return `${(j / 365).toFixed(1).replace(".", ",")} an`;
}

const GRADES = [
  { q: 0, label: "Raté", key: "1", cls: "text-destructive" },
  { q: 1, label: "Dur", key: "2", cls: "" },
  { q: 2, label: "Bien", key: "3", cls: "" },
  { q: 3, label: "Facile", key: "4", cls: "text-ok" },
];

export function ReviserClient({ cards }: { cards: Card[] }) {
  const [queue, setQueue] = useState<Card[]>(cards);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState({ su: 0, raté: 0 });
  const [confirmDel, setConfirmDel] = useState(false);
  // Historique pour Ctrl+Z : chaque note empilée avec ce qu'il faut pour la défaire.
  const history = useRef<
    { card: Card; index: number; quality: number; requeued: boolean }[]
  >([]);

  const card = queue[index];
  const done = index >= queue.length;

  function grade(q: number) {
    if (!card) return;
    history.current.push({ card, index, quality: q, requeued: q === 0 });
    void actionGradeDossierCard(card.id, q);
    setScore((s) =>
      q > 0 ? { ...s, su: s.su + 1 } : { ...s, raté: s.raté + 1 }
    );
    // Raté : la carte revient plus tard dans la session (comme « Again » d'Anki).
    if (q === 0) setQueue((qu) => [...qu, card]);
    setRevealed(false);
    setConfirmDel(false);
    setIndex((i) => i + 1);
  }

  // Ctrl/Cmd+Z : annule la dernière note, restaure l'état SM-2 de la carte côté
  // serveur, et revient dessus (réponse affichée) pour re-choisir.
  function undo() {
    const h = history.current.pop();
    if (!h) return;
    void actionRestoreDossierCard(
      h.card.id,
      h.card.interval,
      h.card.streak,
      h.card.ease
    );
    if (h.requeued) setQueue((qu) => qu.slice(0, -1)); // retire la copie re-enfilée
    setScore((s) =>
      h.quality > 0
        ? { ...s, su: Math.max(0, s.su - 1) }
        : { ...s, raté: Math.max(0, s.raté - 1) }
    );
    setIndex(h.index);
    setRevealed(true);
    setConfirmDel(false);
  }

  function supprimer() {
    if (!card) return;
    void actionDeleteDossierCard(card.id);
    // On retire la carte courante ; l'index pointe alors sur la suivante.
    setQueue((qu) => qu.filter((_, i) => i !== index));
    setRevealed(false);
    setConfirmDel(false);
  }

  // Raccourcis : Espace/Entrée révèle, 1=raté 2=dur 3=bien 4=facile, Ctrl/Cmd+Z annule.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        undo();
        return;
      }
      if (done) return;
      if (!revealed) {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          setRevealed(true);
        }
      } else {
        const g = GRADES.find((x) => x.key === e.key);
        if (g) {
          e.preventDefault();
          grade(g.q);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, index, done, queue.length]);

  if (cards.length === 0) return null;

  if (done) {
    return (
      <div className="py-16 text-center">
        <p className="font-mono text-6xl tabular-nums">
          <span className="text-ok">{score.su}</span>
          <span className="text-2xl text-muted-foreground"> su, </span>
          <span className="text-destructive">{score.raté}</span>
          <span className="text-2xl text-muted-foreground"> raté</span>
        </p>
        <p className="mt-6 font-serif text-2xl">
          Session terminée. Les cartes reviendront à leur échéance.
        </p>
      </div>
    );
  }

  return (
    <div className="py-12">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
          {card.dossier} · {index + 1}/{queue.length}
          {card.cloze && <span className="ml-2 text-primary">texte à trou</span>}
        </p>
        {confirmDel ? (
          <span className="flex items-center gap-2 text-xs">
            <button
              onClick={supprimer}
              className="text-destructive transition-colors hover:underline"
            >
              confirmer la suppression
            </button>
            <button
              onClick={() => setConfirmDel(false)}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              annuler
            </button>
          </span>
        ) : (
          <button
            onClick={() => setConfirmDel(true)}
            className="text-xs text-muted-foreground transition-colors hover:text-destructive"
          >
            supprimer
          </button>
        )}
      </div>

      {/* Recto : pour un cloze révélé, on remplit le trou en surbrillance */}
      {card.cloze && revealed ? (
        <p className="mt-6 max-w-3xl text-balance font-serif text-4xl leading-snug">
          {card.question.split("___")[0]}
          <span className="text-info">{card.reponse}</span>
          {card.question.split("___").slice(1).join("___")}
        </p>
      ) : (
        <p className="mt-6 max-w-3xl text-balance font-serif text-4xl leading-snug">
          {card.question}
        </p>
      )}

      {!revealed ? (
        <Button className="mt-10" onClick={() => setRevealed(true)}>
          {card.cloze ? "Révéler" : "Révéler la réponse"}
        </Button>
      ) : (
        <div className="mt-10">
          {!card.cloze && (
            <p className="max-w-3xl font-serif text-2xl leading-relaxed text-info">
              {card.reponse}
            </p>
          )}
          <div className="mt-8 flex flex-wrap items-stretch gap-2">
            {GRADES.map((g) => (
              <button
                key={g.q}
                onClick={() => grade(g.q)}
                className={`flex min-w-24 flex-col items-center gap-0.5 rounded-md border border-border px-4 py-2 transition-colors hover:border-primary ${g.cls}`}
              >
                <span className="text-[15px]">{g.label}</span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {formatJours(projeter(card, g.q))}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
