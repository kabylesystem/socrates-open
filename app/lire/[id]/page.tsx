import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getBook,
  listBookCards,
  listBookDossiers,
  listBookNotes,
  type BookNote,
} from "@/lib/db";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChapterSelect } from "@/components/chapter-select";
import { SommairePoller } from "@/components/sommaire-poller";
import { SubmitButton } from "@/components/submit-button";
import { PendingCycler } from "@/components/pending-cycler";
import {
  actionAddBookNote,
  actionDeleteReadingBook,
  actionDeleteBookNote,
  actionFetchBookChapters,
  actionGenerateBookCards,
  actionSetBookStatus,
  actionSynthesizeBook,
  actionUpdateBookBefore,
} from "@/app/actions";

const NOTE_TYPES = [
  { v: "idee", label: "Idée" },
  { v: "citation", label: "Citation" },
  { v: "question", label: "Question" },
  { v: "desaccord", label: "Désaccord" },
] as const;

// Regroupe les notes par chapitre, dans l'ordre où les chapitres apparaissent.
function groupByChapter(notes: BookNote[]): [string, BookNote[]][] {
  const order: string[] = [];
  const map = new Map<string, BookNote[]>();
  for (const n of notes) {
    const key = n.chapitre ?? "";
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(n);
  }
  return order.map((k) => [k, map.get(k)!]);
}

function chapterLabel(c: string): string {
  if (!c) return "Hors chapitre";
  return /^\d+$/.test(c) ? `Chapitre ${c}` : c;
}

// L'IA préfixe souvent « Avant ce livre… » / « Après… » : on retire ce
// marqueur initial pour ne pas le doubler avec le libellé affiché.
function stripMarker(text: string): string {
  const t = text
    .trim()
    .replace(/^(avant|après)(\s+ce\s+livre)?\s*[,:–—-]?\s*/i, "");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const NOTE_COLOR: Record<BookNote["type"], string> = {
  idee: "",
  citation: "text-foreground",
  argument: "text-ok",
  question: "text-info",
  desaccord: "text-destructive",
  chapitre: "text-primary",
};

// Rappel léger selon le temps écoulé depuis la fin.
function recallPrompt(dateFinished: string | null): string | null {
  if (!dateFinished) return null;
  const h = (Date.now() - new Date(dateFinished + "Z").getTime()) / 3_600_000;
  if (h >= 24 * 30) return "Rappel 30 jours — Quelle idée de ce livre t'est encore utile aujourd'hui ?";
  if (h >= 24 * 7) return "Rappel 7 jours — Explique ce livre en 3 minutes, à voix haute.";
  if (h >= 40) return "Rappel 48 h — Quelles sont les 5 idées dont tu te souviens, sans regarder ?";
  return null;
}

export default async function BookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const book = getBook(Number(id));
  if (!book) notFound();
  const notes = listBookNotes(book.id);
  const cards = listBookCards(book.id);
  const dossiers = listBookDossiers(book.id);
  let synth: {
    key_ideas?: string[];
    concepts?: string[];
    arguments?: string[];
    counterarguments?: string[];
    dossiers_suggeres?: string[];
  } | null = null;
  if (book.synthese) {
    try {
      synth = JSON.parse(book.synthese);
    } catch {
      synth = null;
    }
  }
  const recall = recallPrompt(book.date_finished);
  // Le chapitre reste « collé » à la dernière capture pour ne pas le retaper.
  const lastChapter = notes.length ? (notes[notes.length - 1].chapitre ?? "") : "";
  // Sommaire pré-rempli par l'IA (le séquençage de la lecture).
  let toc: { num: string; titre: string }[] = [];
  if (book.chapitres) {
    try {
      toc = JSON.parse(book.chapitres);
    } catch {
      toc = [];
    }
  }
  const tocTitle = new Map(toc.map((c) => [c.num, c.titre]));
  const tocRank = new Map(toc.map((c, i) => [c.num, i]));
  const notesPerChap = new Map<string, number>();
  for (const n of notes) {
    const k = n.chapitre ?? "";
    notesPerChap.set(k, (notesPerChap.get(k) ?? 0) + 1);
  }
  // Groupes de notes, triés selon l'ordre du sommaire (hors-chapitre en dernier).
  const rankOf = (k: string) =>
    tocRank.has(k) ? tocRank.get(k)! : k === "" ? 1e9 : 1e8;
  const chapters = groupByChapter(notes).sort(
    (a, b) => rankOf(a[0]) - rankOf(b[0])
  );
  const headerFor = (k: string) =>
    tocTitle.has(k) ? `${chapterLabel(k)} — ${tocTitle.get(k)}` : chapterLabel(k);

  return (
    <div className="px-6 py-10 md:px-12 lg:px-16">
      {/* Identité */}
      <header className="flex flex-wrap items-start gap-6 border-b border-border pb-8">
        {book.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={book.cover_url}
            alt={book.titre}
            className="h-40 w-28 shrink-0 rounded-sm border border-border object-cover"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <Link
            href="/lire"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            ← Lire
          </Link>
          <h1 className="mt-1 text-balance font-serif text-5xl tracking-tight lg:text-6xl">
            {book.titre}
          </h1>
          <p className="mt-2 text-[15px] text-muted-foreground">{book.auteur}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {(
              [
                ["reading", "En cours", "border-primary text-primary"],
                ["finished", "Terminé", "border-ok text-ok"],
                ["abandoned", "Abandonné", "border-muted-foreground text-muted-foreground"],
              ] as const
            ).map(([s, lbl, activeCls]) => (
              <form key={s} action={actionSetBookStatus}>
                <input type="hidden" name="bookId" value={book.id} />
                <input type="hidden" name="statut" value={s} />
                <button
                  type="submit"
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    book.statut === s
                      ? activeCls
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {lbl}
                </button>
              </form>
            ))}
            {dossiers.length > 0 && (
              <span className="ml-2 text-xs text-muted-foreground">
                relié à{" "}
                {dossiers.map((d, i) => (
                  <span key={d.slug}>
                    {i > 0 && ", "}
                    <Link
                      href={`/d/${d.slug}`}
                      className="text-info hover:text-foreground"
                    >
                      {d.nom}
                    </Link>
                  </span>
                ))}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Avant de lire */}
      <section className="border-b border-border py-8">
        <p className="mb-4 text-[15px] text-muted-foreground">
          Avant de lire (moins de 2 minutes)
        </p>
        <form action={actionUpdateBookBefore} className="max-w-3xl space-y-3">
          <input type="hidden" name="bookId" value={book.id} />
          <Input
            name="pourquoi"
            defaultValue={book.pourquoi ?? ""}
            placeholder="Pourquoi je lis ce livre ?"
          />
          <Input
            name="objectif"
            defaultValue={book.objectif ?? ""}
            placeholder="Qu'est-ce que je veux mieux comprendre après ?"
          />
          <SubmitButton variant="ghost" size="sm" pendingLabel="Enregistré ✓">
            Enregistrer
          </SubmitButton>
        </form>
      </section>

      {/* Rappel léger */}
      {recall && (
        <section className="border-b border-border py-6">
          <p className="font-serif text-xl leading-snug text-info">{recall}</p>
        </section>
      )}

      {/* Sommaire — le séquençage pré-posé par l'IA */}
      <section className="border-b border-border py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-2xl">Sommaire</h2>
          <form action={actionFetchBookChapters}>
            <input type="hidden" name="bookId" value={book.id} />
            <SubmitButton
              variant="ghost"
              size="sm"
              pendingLabel="Recherche du sommaire…"
            >
              {toc.length ? "Regénérer" : "Trouver le sommaire"}
            </SubmitButton>
          </form>
        </div>
        {toc.length ? (
          <ol className="mt-5 max-w-3xl space-y-1.5">
            {toc.map((c) => {
              const n = notesPerChap.get(c.num) ?? 0;
              return (
                <li
                  key={c.num}
                  className="flex items-baseline gap-3 text-[15px]"
                >
                  <span className="w-10 shrink-0 font-mono text-xs text-muted-foreground">
                    {c.num}
                  </span>
                  <span className={n ? "text-foreground" : "text-muted-foreground"}>
                    {c.titre}
                  </span>
                  {n > 0 && (
                    <span className="ml-auto font-mono text-xs text-primary">
                      {n} note{n > 1 ? "s" : ""}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        ) : (
          <>
            <SommairePoller />
            <p className="mt-4 flex max-w-3xl items-center gap-3 text-[15px] text-muted-foreground">
              <span className="inline-block size-2 shrink-0 animate-pulse rounded-full bg-info" />
              Le sommaire se récupère en arrière-plan (recherche web) — il
              apparaîtra ici tout seul. Sinon, clique sur « Trouver le sommaire ».
            </p>
          </>
        )}
      </section>

      {/* Capture chapitre par chapitre */}
      <section className="border-b border-border py-8">
        <p className="mb-5 text-[15px] text-muted-foreground">
          Avance chapitre par chapitre. Choisis le chapitre, puis capture ce
          qui compte : une idée forte, une citation, un désaccord. Prends la
          place qu&apos;il te faut.
        </p>
        <form action={actionAddBookNote} className="max-w-3xl">
          <input type="hidden" name="bookId" value={book.id} />
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {toc.length ? (
              <ChapterSelect chapters={toc} defaultValue={lastChapter} />
            ) : (
              <Input
                name="chapitre"
                defaultValue={lastChapter}
                placeholder="Chapitre"
                className="h-8 w-32"
                aria-label="Chapitre"
              />
            )}
            <span className="px-1 text-border" aria-hidden>
              ·
            </span>
            {NOTE_TYPES.map((t, i) => (
              <label
                key={t.v}
                className="cursor-pointer rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors has-[:checked]:border-primary has-[:checked]:text-primary"
              >
                <input
                  type="radio"
                  name="type"
                  value={t.v}
                  defaultChecked={i === 0}
                  className="hidden"
                />
                {t.label}
              </label>
            ))}
          </div>
          <Textarea
            name="contenu"
            placeholder="Capturer… (écris autant que tu veux)"
            className="min-h-32 leading-relaxed"
            required
          />
          <div className="mt-3">
            <SubmitButton variant="ghost" size="sm" pendingLabel="…">
              Ajouter
            </SubmitButton>
          </div>
        </form>

        {chapters.length > 0 && (
          <div className="mt-8 space-y-8">
            {chapters.map(([chap, items]) => (
              <div key={chap || "—"}>
                <p className="mb-2 border-b border-border/60 pb-2 font-serif text-lg text-primary">
                  {headerFor(chap)}
                  <span className="ml-2 font-mono text-xs text-muted-foreground">
                    {items.length}
                  </span>
                </p>
                {items.map((n) => (
                  <div
                    key={n.id}
                    className="group flex items-baseline justify-between gap-4 border-b border-border/40 py-3"
                  >
                    <p className="min-w-0 whitespace-pre-wrap text-[15px] leading-relaxed">
                      <span
                        className={`mr-2 text-xs uppercase tracking-wider ${NOTE_COLOR[n.type]}`}
                      >
                        {n.type}
                      </span>
                      {n.contenu}
                    </p>
                    <form action={actionDeleteBookNote}>
                      <input type="hidden" name="bookId" value={book.id} />
                      <input type="hidden" name="noteId" value={n.id} />
                      <button
                        type="submit"
                        className="text-xs text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                      >
                        suppr.
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Synthèse finale */}
      <section className="border-b border-border py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-2xl">Synthèse finale</h2>
          <form action={actionSynthesizeBook} className="flex items-center gap-3">
            <input type="hidden" name="bookId" value={book.id} />
            <SubmitButton size="sm" pendingLabel="L'IA synthétise…">
              {synth ? "Regénérer" : "Terminer + synthèse"}
            </SubmitButton>
            <PendingCycler
              messages={[
                "Lecture de tes notes…",
                "Extraction des idées clés et arguments…",
                "Évolution de ta vision du monde…",
              ]}
            />
          </form>
        </div>

        {!synth ? (
          <p className="mt-4 max-w-3xl text-[15px] text-muted-foreground">
            Quand tu as fini, Socrates lit tes notes et en tire les idées clés,
            les arguments réutilisables, ce qui a changé dans ta vision, et les
            dossiers à mettre à jour.
          </p>
        ) : (
          <div className="mt-6 space-y-8">
            {book.pensee_avant && (
              <div className="max-w-3xl space-y-5 border-l-2 border-primary pl-5">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    Avant
                  </p>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">
                    {stripMarker(book.pensee_avant)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-primary">
                    Après
                  </p>
                  <p className="mt-1.5 font-serif text-lg leading-relaxed">
                    {stripMarker(book.pensee_apres ?? "")}
                  </p>
                </div>
                {book.conf_avant != null && book.conf_apres != null && (
                  <p className="font-mono text-sm text-info">
                    confiance {book.conf_avant}% → {book.conf_apres}%
                  </p>
                )}
              </div>
            )}
            {(
              [
                ["Idées clés", synth.key_ideas],
                ["Concepts", synth.concepts],
                ["Arguments réutilisables", synth.arguments],
                ["Contre-arguments", synth.counterarguments],
              ] as const
            ).map(
              ([titre, items]) =>
                !!items?.length && (
                  <div key={titre}>
                    <p className="text-[15px] text-muted-foreground">{titre}</p>
                    <ul className="mt-2 max-w-3xl list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed">
                      {items.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </div>
                )
            )}
          </div>
        )}
      </section>

      {/* Flashcards */}
      {synth && (
        <section className="border-b border-border py-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-serif text-2xl">
              Flashcards
              {cards.length > 0 && (
                <span className="ml-2 font-mono text-sm text-muted-foreground">
                  {cards.length}
                </span>
              )}
            </h2>
            <form action={actionGenerateBookCards}>
              <input type="hidden" name="bookId" value={book.id} />
              <SubmitButton variant="ghost" size="sm" pendingLabel="Génération…">
                {cards.length ? "Regénérer" : "Générer les flashcards"}
              </SubmitButton>
            </form>
          </div>
          {cards.length > 0 && (
            <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {cards.map((c) => (
                <details
                  key={c.id}
                  className="rounded-sm border border-border p-4"
                >
                  <summary className="cursor-pointer list-none font-serif text-[15px] [&::-webkit-details-marker]:hidden">
                    {c.question}
                  </summary>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
                    {c.reponse}
                  </p>
                </details>
              ))}
            </div>
          )}
        </section>
      )}

      <form action={actionDeleteReadingBook} className="pt-6">
        <input type="hidden" name="bookId" value={book.id} />
        <button
          type="submit"
          className="text-xs text-muted-foreground transition-colors hover:text-destructive"
        >
          Retirer ce livre
        </button>
      </form>
    </div>
  );
}
