import {
  actionCardsFromRessource,
  actionDeleteRessource,
} from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import type { Ressource } from "@/lib/db";

// Métadonnées d'affichage par type de ressource (label propre + accent sobre).
const TYPE_META: Record<string, { label: string; cls: string }> = {
  tweet: { label: "Tweet", cls: "text-info" },
  thread: { label: "Thread", cls: "text-info" },
  x: { label: "X", cls: "text-info" },
  conversation: { label: "Conversation", cls: "text-primary" },
  chatgpt: { label: "ChatGPT", cls: "text-primary" },
  article: { label: "Article", cls: "text-ok" },
  video: { label: "Vidéo", cls: "text-info" },
  note: { label: "Note", cls: "text-muted-foreground" },
};
const ORDER = ["tweet", "thread", "x", "conversation", "chatgpt", "article", "video", "note"];

function meta(type: string) {
  const k = type.toLowerCase();
  return (
    TYPE_META[k] ?? {
      label: type.charAt(0).toUpperCase() + type.slice(1),
      cls: "text-muted-foreground",
    }
  );
}

export function RessourceList({
  ressources,
  slug,
}: {
  ressources: Ressource[];
  slug: string;
}) {
  // Tri : par type (ordre stable), puis par récence (déjà DESC en entrée).
  const rank = (t: string) => {
    const i = ORDER.indexOf(t.toLowerCase());
    return i < 0 ? 99 : i;
  };
  const sorted = [...ressources].sort((a, b) => rank(a.type) - rank(b.type));

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h2 className="font-serif text-2xl">Ressources</h2>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {ressources.length}
        </span>
      </div>
      <p className="mt-1 text-[15px] text-muted-foreground">
        Ce que tu as apporté (X, ChatGPT, articles, vidéos), trié et résumé. Un
        clic pour en faire des flashcards.
      </p>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {sorted.map((r) => {
          const m = meta(r.type);
          let points: string[] = [];
          try {
            if (r.points) points = JSON.parse(r.points);
          } catch {}
          return (
            <div
              key={r.id}
              className="group flex flex-col rounded-lg border border-border p-5 transition-colors hover:border-border/80"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span
                  className={`shrink-0 font-mono text-[11px] uppercase tracking-wider ${m.cls}`}
                >
                  {m.label}
                </span>
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground/70">
                  {r.created_at.slice(0, 10)}
                </span>
              </div>
              <p className="mt-1.5 font-serif text-lg leading-snug">{r.titre}</p>
              {r.source && (
                <p className="mt-0.5 text-xs text-muted-foreground">{r.source}</p>
              )}
              {r.resume && (
                <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
                  {r.resume}
                </p>
              )}
              {points.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer list-none text-xs text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                    {points.length} point{points.length > 1 ? "s" : ""} clé
                    {points.length > 1 ? "s" : ""}
                  </summary>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px] leading-relaxed text-muted-foreground">
                    {points.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </details>
              )}
              <div className="mt-auto flex items-center gap-4 pt-4">
                <form action={actionCardsFromRessource.bind(null, r.id, slug)}>
                  <SubmitButton
                    variant="ghost"
                    size="sm"
                    pendingLabel="Génération…"
                  >
                    En faire des flashcards
                  </SubmitButton>
                </form>
                <form action={actionDeleteRessource.bind(null, r.id, slug)}>
                  <button
                    type="submit"
                    className="text-xs text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  >
                    supprimer
                  </button>
                </form>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
