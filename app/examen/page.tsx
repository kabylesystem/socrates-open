import { listDossiers, listExamens } from "@/lib/db";
import { ExamenClient } from "./examen-client";

export default function ExamenPage() {
  const dossiers = listDossiers().map((d) => ({ slug: d.slug, nom: d.nom }));
  const examens = listExamens(8);

  return (
    <div className="px-6 py-10 md:px-12 lg:px-16">
      <ExamenClient dossiers={dossiers} />

      {examens.length > 0 && (
        <section className="mt-12 border-t border-border py-8">
          <h2 className="text-balance font-serif text-2xl">
            Examens passés
          </h2>
          <div className="mt-2">
            {examens.map((e) => {
              let note: number | null = null;
              try {
                note = JSON.parse(e.correction ?? "{}").note_sur_20 ?? null;
              } catch {}
              return (
                <div
                  key={e.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1 border-b border-border py-4"
                >
                  <p className="min-w-0 max-w-3xl font-serif text-lg leading-relaxed">
                    {e.sujet}
                  </p>
                  <p className="font-mono text-sm tabular-nums text-muted-foreground">
                    {e.dossier_nom} · {e.created_at.slice(0, 10)}
                    {note !== null && (
                      <span className="ml-3 text-foreground">{note}/20</span>
                    )}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
