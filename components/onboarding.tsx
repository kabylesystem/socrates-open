"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Compass,
  FolderOpen,
  Swords,
  Video,
  Dices,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type Step = {
  icon: LucideIcon;
  kicker: string;
  titre: string;
  corps: string;
};

const STEPS: Step[] = [
  {
    icon: Compass,
    kicker: "C'est quoi",
    titre: "Un second cerveau pour ta pensée politique",
    corps:
      "Socrates ne te donne pas d'opinions. Il t'aide à en construire de profondes, cohérentes et difficiles à manipuler — pour qu'un jour, tu ne perdes plus aucun débat. C'est ton cerveau qui travaille ; l'IA n'est que l'assistant.",
  },
  {
    icon: FolderOpen,
    kicker: "Le principe",
    titre: "Chaque sujet est un dossier",
    corps:
      "Immigration, énergie, dette, IA, Europe… Dans chaque dossier : les faits chiffrés et sourcés, les écoles de pensée, les arguments des deux camps, et surtout TA position avec ton niveau de confiance — qui s'affine avec le temps.",
  },
  {
    icon: Swords,
    kicker: "La boucle",
    titre: "Apprends, positionne-toi, fais-toi attaquer",
    corps:
      "Un professeur t'enseigne le sujet par la discussion. Tu formules ta position. Puis tu débats contre 9 adversaires — socialiste, conservateur, libertarien, marxiste… — qui démolissent tes idées. Être mis en difficulté, c'est une victoire : tu en ressors plus solide.",
  },
  {
    icon: Video,
    kicker: "Nourris-le",
    titre: "Tout ce que tu consommes entre dans la base",
    corps:
      "Tu te cultives sur YouTube ? Colle le lien : la vidéo est résumée, ses faits rangés dans les bons dossiers, et gardée pour ne plus jamais l'oublier. Pareil pour n'importe quel texte, conversation ou article.",
  },
  {
    icon: Dices,
    kicker: "Entraîne-toi pour de vrai",
    titre: "L'examen du week-end",
    corps:
      "Une roulette tire un sujet au hasard : une heure, papier et stylo, comme un concours. Tu photographies ta copie, un jury exigeant la corrige sur 20. Et tu révises les chiffres clés façon Anki, jour après jour.",
  },
  {
    icon: TrendingUp,
    kicker: "Sur la durée",
    titre: "Une vision du monde qui se construit sur des années",
    corps:
      "Tout est gardé : l'évolution de tes positions, tes contradictions entre sujets, ta maîtrise qui monte dossier par dossier. Ce n'est pas une app à opinions. C'est un projet de plusieurs années.",
  },
];

export function Onboarding() {
  const router = useRouter();
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const Icon = step.icon;
  const last = i === STEPS.length - 1;

  function finir() {
    localStorage.setItem("socrates-onboarded", "1");
    router.push("/");
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between px-6 py-6 md:px-12">
        <span className="font-serif text-2xl">Socrates</span>
        <button
          onClick={finir}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Passer
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center px-6">
        <div className="max-w-2xl">
          <Icon className="size-8 text-primary" aria-hidden />
          <p className="mt-6 text-xs font-medium uppercase tracking-[0.25em] text-muted-foreground">
            {step.kicker}
          </p>
          <h1 className="mt-3 text-balance font-serif text-4xl leading-tight tracking-tight lg:text-5xl">
            {step.titre}
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            {step.corps}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 px-6 py-8 md:px-12">
        <div className="flex gap-2">
          {STEPS.map((_, k) => (
            <span
              key={k}
              className={`h-1.5 rounded-full transition-all ${
                k === i ? "w-6 bg-primary" : "w-1.5 bg-border"
              }`}
            />
          ))}
        </div>
        <div className="flex items-center gap-3">
          {i > 0 && (
            <Button
              variant="ghost"
              onClick={() => setI((x) => x - 1)}
              className="text-muted-foreground"
            >
              Précédent
            </Button>
          )}
          {last ? (
            <Button onClick={finir}>Commencer</Button>
          ) : (
            <Button onClick={() => setI((x) => x + 1)}>Suivant</Button>
          )}
        </div>
      </div>
    </div>
  );
}
