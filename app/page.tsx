import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  countEntriesByDossier,
  groupByCategorie,
  listCategories,
  listContradictions,
  listDossiers,
  listRecentVideos,
  maitriseByCategorie,
  maitriseByDossier,
} from "@/lib/db";
import { thumbnailUrl } from "@/lib/youtube";
import {
  actionCreateDossier,
  actionDetectContradictions,
  actionResolveContradiction,
} from "./actions";
import { Input } from "@/components/ui/input";
import { CategoryCombo } from "@/components/category-combo";
import { SubmitButton } from "@/components/submit-button";
import { FirstVisit } from "@/components/first-visit";

export default function Home() {
  const dossiers = listDossiers();
  const contradictions = listContradictions();
  const videos = listRecentVideos(8);
  const maitrise = maitriseByDossier();
  const maitriseCat = maitriseByCategorie();
  const entryCounts = countEntriesByDossier();

  return (
    <div className="px-6 py-10 md:px-12 lg:px-16">
      <FirstVisit />
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-border pb-8">
        <div>
          <h1 className="text-balance font-serif text-6xl tracking-tight lg:text-7xl">
            Où j&apos;en suis
          </h1>
          <p className="mt-3 text-[15px] text-muted-foreground">
            Ta maîtrise de chaque sujet, domaine par domaine. Ouvre un dossier
            pour apprendre, te positionner et débattre.{" "}
            <Link
              href="/bienvenue"
              className="text-primary transition-colors hover:text-foreground"
            >
              C&apos;est quoi Socrates ?
            </Link>
          </p>
        </div>
        <form action={actionDetectContradictions} className="pb-2">
          <SubmitButton size="sm" pendingLabel="Athe userse en cours…">
            Vérifier ma cohérence
          </SubmitButton>
        </form>
      </header>

      {contradictions.length > 0 && (
        <section className="border-b border-border py-8">
          <h2 className="text-balance font-serif text-2xl text-destructive">
            Contradictions ouvertes
          </h2>
          <div className="mt-2">
            {contradictions.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 border-b border-border py-4"
              >
                <p className="max-w-3xl font-serif text-lg leading-relaxed">
                  {c.texte}
                </p>
                <form action={actionResolveContradiction}>
                  <input type="hidden" name="id" value={c.id} />
                  <Button variant="ghost" size="sm" type="submit">
                    Marquer résolue
                  </Button>
                </form>
              </div>
            ))}
          </div>
        </section>
      )}

      {groupByCategorie(dossiers).map(([categorie, items]) => (
        <section key={categorie} className="border-b border-border py-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-balance font-serif text-3xl">{categorie}</h2>
            <div className="flex items-center gap-3">
              <span className="h-2 w-40 overflow-hidden rounded-full bg-secondary">
                <span
                  className="block h-full rounded-full bg-info"
                  style={{ width: `${maitriseCat[categorie] ?? 0}%` }}
                />
              </span>
              <span className="w-10 text-right font-mono text-sm tabular-nums text-info">
                {maitriseCat[categorie] ?? 0}%
              </span>
            </div>
          </div>
          <div className="mt-4">
            {items.map((d) => {
              const n = entryCounts[d.id] ?? 0;
              return (
                <Link
                  key={d.slug}
                  href={`/d/${d.slug}`}
                  className="group flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1 border-b border-border py-4 transition-colors hover:bg-accent/40"
                >
                  <div className="min-w-0 max-w-3xl">
                    <p className="font-serif text-2xl group-hover:text-foreground">
                      {d.nom}
                    </p>
                    {d.position.trim() && (
                      <p className="mt-1 truncate text-[15px] text-muted-foreground">
                        {d.position}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm tabular-nums text-muted-foreground">
                      {n} élément{n > 1 ? "s" : ""}
                    </span>
                    <span className="h-1.5 w-20 overflow-hidden rounded-full bg-secondary">
                      <span
                        className="block h-full rounded-full bg-info"
                        style={{ width: `${maitrise[d.id] ?? 0}%` }}
                      />
                    </span>
                    <span className="w-10 text-right font-mono text-sm tabular-nums text-muted-foreground">
                      {maitrise[d.id] ?? 0}%
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      <form
        action={actionCreateDossier}
        className="flex flex-wrap items-center gap-3 py-6"
      >
        <Input
          name="nom"
          placeholder="Nouveau dossier (ex. Retraites…)"
          className="max-w-xs"
          required
        />
        <CategoryCombo categories={listCategories()} />
        <Button variant="ghost" size="sm" type="submit">
          Créer
        </Button>
      </form>

      {videos.length > 0 && (
        <section className="border-t border-border py-8">
          <h2 className="text-balance font-serif text-2xl">
            Dernières vidéos
          </h2>
          <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
            {videos.map((v) => (
              <a
                key={v.id}
                href={v.url}
                target="_blank"
                rel="noreferrer"
                className="group"
              >
                <div className="aspect-video overflow-hidden rounded-sm border border-border bg-secondary">
                  {v.video_id && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumbnailUrl(v.video_id)}
                      alt={v.titre ?? "Vidéo"}
                      className="h-full w-full object-cover transition-opacity group-hover:opacity-80"
                    />
                  )}
                </div>
                <p className="mt-2 line-clamp-2 text-[13px] leading-snug transition-colors group-hover:text-primary">
                  {v.titre ?? v.url}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {v.dossiers.map((d) => d.nom).join(", ")}
                </p>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
