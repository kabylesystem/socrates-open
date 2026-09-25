import Link from "next/link";
import { notFound } from "next/navigation";
import { countDossierCards, getDossier } from "@/lib/db";
import { LessonChat } from "@/components/lesson-chat";

export default async function LeconPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const dossier = getDossier(slug);
  if (!dossier) notFound();

  let steps: string[] = [];
  if (dossier.cours) {
    try {
      const cours = JSON.parse(dossier.cours) as {
        sections: { titre: string }[];
      };
      steps = cours.sections.map((s) => s.titre).filter(Boolean);
    } catch {
      steps = [];
    }
  }

  // État de reprise (sauvé côté serveur) : on reprend exactement où on s'est arrêté.
  let initial:
    | {
        stepIndex: number;
        messages: { role: "user" | "assistant"; content: string }[];
        mastered: number[];
        status: ("pending" | "done" | "review")[];
      }
    | undefined;
  if (dossier.lecon) {
    try {
      initial = JSON.parse(dossier.lecon);
    } catch {
      initial = undefined;
    }
  }

  return (
    <div className="mx-auto flex h-screen w-full max-w-4xl flex-col px-6 py-8">
      <header className="border-b border-border pb-5">
        <Link
          href={`/d/${dossier.slug}`}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← {dossier.nom}
        </Link>
        <h1 className="mt-1 font-serif text-4xl tracking-tight">Leçon</h1>
      </header>

      {steps.length === 0 ? (
        <div className="flex flex-1 items-center">
          <p className="max-w-2xl font-serif text-2xl leading-snug text-muted-foreground">
            Le plan de la leçon n&apos;est pas encore prêt pour ce dossier.
            Reviens en arrière et lance «&nbsp;Écrire le cours de fond&nbsp;» —
            l&apos;IA en tire le plan, puis le tuteur t&apos;enseigne pas à pas.
          </p>
        </div>
      ) : (
        <LessonChat
          slug={dossier.slug}
          steps={steps}
          initial={initial}
          initialCards={countDossierCards(dossier.id)}
        />
      )}
    </div>
  );
}
