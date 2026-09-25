import Link from "next/link";
import { Lock } from "lucide-react";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  countDossierCards,
  countUnverifiedFacts,
  getDossier,
  listBooks,
  listDebats,
  listEntries,
  listOngoingConversations,
  listRessources,
  listVideosForDossier,
  lessonFinished,
  maitriseFor,
  type Entry,
} from "@/lib/db";
import { DEBATE_MODES } from "@/lib/ai";
import { thumbnailUrl } from "@/lib/youtube";
import {
  actionAddEntry,
  actionApplySplit,
  actionDeleteBook,
  actionDeleteEntry,
  actionDetectSplits,
  actionDismissSplit,
  actionRecommendBooks,
  actionToggleBook,
} from "@/app/actions";
import { RessourceList } from "@/components/ressource-list";
import { NotesEditor } from "@/components/notes-editor";
import { SubmitButton } from "@/components/submit-button";
import { ExploreSheet } from "@/components/explore-sheet";
import { PrepareButton } from "@/components/prepare-button";
import { GenPoller } from "@/components/gen-poller";

const MODE_LABELS: Record<string, string> = Object.fromEntries(
  DEBATE_MODES.map((m) => [m.value, m.label])
);

// L'échelle de difficulté : on monte en niveau jusqu'à maîtriser le sujet.
const LADDER: { niveau: string; titre: string; sous: string; modes: string[] }[] =
  [
    {
      niveau: "1",
      titre: "Échauffement",
      sous: "On te guide, tu te lances sans pression.",
      modes: ["steelman"],
    },
    {
      niveau: "2",
      titre: "Le vrai débat",
      sous: "Face à des positions adverses construites, qui tiennent.",
      modes: [
        "socialiste",
        "conservateur",
        "libertarien",
        "marxiste",
        "technocrate",
        "federaliste",
      ],
    },
    {
      niveau: "3",
      titre: "Mise à l'épreuve",
      sous: "On cherche tes failles sans pitié — c'est là que tu deviens redoutable.",
      modes: ["devil", "destroy"],
    },
  ];

const tabTriggerClass =
  "rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 pb-2 text-base text-muted-foreground shadow-none transition-colors hover:text-foreground data-[state=active]:border-b-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none";

const TYPES: { type: Entry["type"]; tab: string; label: string }[] = [
  { type: "fait", tab: "faits", label: "Faits" },
  { type: "ecole", tab: "ecoles", label: "Écoles de pensée" },
  { type: "argument", tab: "arguments", label: "Arguments" },
  { type: "contre", tab: "contres", label: "Contre-arguments" },
  { type: "question", tab: "questions", label: "Questions ouvertes" },
];

function DeleteButton({ entryId }: { entryId: number }) {
  return (
    <form action={actionDeleteEntry}>
      <input type="hidden" name="entryId" value={entryId} />
      <button
        type="submit"
        aria-label="Supprimer"
        className="text-sm text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
      >
        supprimer
      </button>
    </form>
  );
}

// Registre des faits : le chiffre (bleu) ouvre la ligne, puis l'énoncé — robuste
// quelle que soit la longueur de la valeur. Cliquer ouvre la conversation.
function FaitRow({
  entry,
  slug,
  dossierId,
}: {
  entry: Entry;
  slug: string;
  dossierId: number;
}) {
  const valeur = entry.valeur ?? "";
  return (
    <div className="group flex items-baseline justify-between gap-x-6 border-b border-border/60 py-3.5 transition-colors hover:bg-accent/30">
      <p className="min-w-0 flex-1 text-[15px] leading-relaxed">
        <ExploreSheet
          slug={slug}
          entryId={entry.id}
          dossierId={dossierId}
          titre={entry.texte}
        >
          <button className="text-left transition-colors hover:text-primary">
            {valeur && (
              <span className="mr-2.5 font-mono tabular-nums text-info">
                {valeur}
              </span>
            )}
            {entry.texte}
          </button>
        </ExploreSheet>
      </p>
      <SourceLink entry={entry} />
      <DeleteButton entryId={entry.id} />
    </div>
  );
}

// Source : lien cliquable si vérifiable (URL), sinon marqueur « à vérifier ».
function SourceLink({ entry }: { entry: Entry }) {
  if (!entry.source) return null;
  const cls =
    "hidden shrink-0 self-center text-xs uppercase tracking-wider lg:block";
  if (entry.source_url) {
    return (
      <a
        href={entry.source_url}
        target="_blank"
        rel="noreferrer"
        className={`${cls} text-muted-foreground transition-colors hover:text-info`}
        title="Ouvrir la source"
      >
        {entry.source} ↗
      </a>
    );
  }
  // Source citée mais sans lien : on l'affiche sobrement (pas d'alarme rouge).
  return <span className={`${cls} text-muted-foreground/70`}>{entry.source}</span>;
}

function EntryRow({
  entry,
  slug,
  dossierId,
}: {
  entry: Entry;
  slug: string;
  dossierId: number;
}) {
  return (
    <div className="group flex items-baseline justify-between gap-x-8 border-b border-border py-4">
      <div className="min-w-0">
        <ExploreSheet
          slug={slug}
          entryId={entry.id}
          dossierId={dossierId}
          titre={entry.texte}
        >
          <button className="max-w-3xl text-left font-serif text-lg leading-relaxed transition-colors hover:text-primary">
            {entry.texte}
          </button>
        </ExploreSheet>
        {entry.source &&
          (entry.source_url ? (
            <a
              href={entry.source_url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block text-xs text-muted-foreground transition-colors hover:text-info"
            >
              {entry.source} ↗
            </a>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">{entry.source}</p>
          ))}
      </div>
      <DeleteButton entryId={entry.id} />
    </div>
  );
}

function AddEntryForm({
  dossierId,
  type,
}: {
  dossierId: number;
  type: Entry["type"];
}) {
  const isFait = type === "fait";
  return (
    <form
      action={actionAddEntry}
      className="flex flex-wrap items-center gap-3 py-4"
    >
      <input type="hidden" name="dossierId" value={dossierId} />
      <input type="hidden" name="type" value={type} />
      {isFait && <Input name="valeur" placeholder="Chiffre" className="w-28" />}
      <Input
        name="texte"
        placeholder="Ajouter…"
        className="max-w-md flex-1"
        required
      />
      {isFait && <Input name="source" placeholder="Source" className="w-36" />}
      <SubmitButton variant="ghost" size="sm" pendingLabel="…">
        Ajouter
      </SubmitButton>
    </form>
  );
}

export default async function DossierPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const dossier = getDossier(slug);
  if (!dossier) notFound();
  const entries = listEntries(dossier.id);
  const debats = listDebats(dossier.id);
  const videos = listVideosForDossier(dossier.id);
  const livres = listBooks(dossier.id);
  const ongoing = listOngoingConversations(dossier.id);
  const unverified = countUnverifiedFacts(dossier.id);
  const cardsCount = countDossierCards(dossier.id);
  const ressources = listRessources(dossier.id);
  const maitrise = maitriseFor(dossier.id);
  // Suggestions « tu zoomes trop sur X » (sous-thèmes à sortir en sujet).
  let splits: {
    nom: string;
    raison: string;
    ressourceIds: number[];
    entryIds: number[];
  }[] = [];
  if (dossier.split_suggestion) {
    try {
      splits = JSON.parse(dossier.split_suggestion);
    } catch {
      splits = [];
    }
  }
  // Modes de débat, ordonnés (du doux au coriace) mais présentés sobrement.
  const debateModes = LADDER.flatMap((t) => t.modes)
    .map((v) => DEBATE_MODES.find((m) => m.value === v))
    .filter((m): m is (typeof DEBATE_MODES)[number] => Boolean(m));
  // « busy » seulement s'il est récent : un busy fantôme (process mort) ne fige
  // plus la page indéfiniment, on repasse à l'état normal au bout de 10 min.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const busy =
    dossier.gen_status === "busy" &&
    !!dossier.gen_started_at &&
    now - new Date(dossier.gen_started_at + "Z").getTime() < 1_800_000;
  const byType = (t: Entry["type"]) => entries.filter((e) => e.type === t);
  let cours: {
    enjeu: string;
    sections: { titre: string; corps: string }[];
  } | null = null;
  if (dossier.cours) {
    try {
      cours = JSON.parse(dossier.cours);
    } catch {
      cours = null; // cours corrompu : on n'écroule pas tout le dossier
    }
  }
  // La confrontation ne s'ouvre qu'une fois le cours (la leçon) terminé : les
  // flashcards + l'opposition sont les MUNITIONS, le cours est l'arme. On apprend
  // d'abord, on se confronte ensuite.
  const coursFini = lessonFinished(dossier.lecon);

  return (
    <div className="px-6 py-10 md:px-12 lg:px-16">
      <header className="border-b border-border pb-8">
        <h1 className="text-balance font-serif text-6xl tracking-tight lg:text-7xl">
          {dossier.nom}
        </h1>
        <p className="mt-3 flex items-center gap-3 text-sm text-muted-foreground">
          <span className="font-mono tabular-nums">Maîtrise {maitrise}%</span>
          <span className="h-1.5 w-32 overflow-hidden rounded-full bg-secondary">
            <span
              className="block h-full rounded-full bg-info"
              style={{ width: `${maitrise}%` }}
            />
          </span>
        </p>
      </header>

      {/* Socrates suggère : un sous-thème assez gros pour son propre sujet */}
      {splits.length > 0 && (
        <section className="border-b border-border py-6">
          <p className="text-xs uppercase tracking-wider text-primary">
            Socrates suggère
          </p>
          <div className="mt-3 space-y-3">
            {splits.map((s, i) => (
              <div
                key={i}
                className="rounded-lg border border-primary/40 bg-primary/5 p-5"
              >
                <p className="font-serif text-lg">
                  Tu zoomes beaucoup sur «&nbsp;{s.nom}&nbsp;»
                </p>
                <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">
                  {s.raison}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  En faire un sujet à part déplacerait{" "}
                  {s.ressourceIds?.length ?? 0} ressource
                  {(s.ressourceIds?.length ?? 0) > 1 ? "s" : ""} et{" "}
                  {s.entryIds?.length ?? 0} élément
                  {(s.entryIds?.length ?? 0) > 1 ? "s" : ""}.
                </p>
                <div className="mt-3 flex items-center gap-4">
                  <form action={actionApplySplit.bind(null, dossier.slug, i)}>
                    <SubmitButton size="sm" pendingLabel="Création…">
                      Créer le sujet «&nbsp;{s.nom}&nbsp;»
                    </SubmitButton>
                  </form>
                  <form action={actionDismissSplit.bind(null, dossier.slug, i)}>
                    <button
                      type="submit"
                      className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                      ignorer
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 1 · Apprendre — le terrain */}
      <section className="border-b border-border py-10">
        <div className="mb-6">
          <h2 className="font-serif text-3xl tracking-tight">Apprendre</h2>
          <p className="mt-1 text-[15px] text-muted-foreground">
            Le cours de fond, la leçon avec le tuteur, et tes flashcards. Le cœur.
          </p>
        </div>

        {dossier.gen_error && !busy && (
          <p className="mb-6 max-w-3xl rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-[15px] text-destructive">
            {dossier.gen_error}
          </p>
        )}

        {busy && (
          <>
            <GenPoller />
            <p className="flex items-center gap-3 font-serif text-2xl leading-snug">
              <span className="inline-block size-2.5 shrink-0 animate-pulse rounded-full bg-info" />
              {cours ? "Mise à jour du cours…" : "L'IA écrit ton cours…"}
            </p>
            {dossier.gen_total > 0 ? (
              <p className="mt-3 font-mono text-sm text-info">
                {dossier.gen_done >= dossier.gen_total
                  ? `${dossier.gen_total} sections rédigées, finalisation…`
                  : `Plan prêt : ${dossier.gen_total} sections. Rédaction ${dossier.gen_done}/${dossier.gen_total}…`}
              </p>
            ) : (
              <p className="mt-3 font-mono text-sm text-muted-foreground">
                Construction du plan…
              </p>
            )}
            <p className="mt-3 max-w-3xl text-[15px] text-muted-foreground">
              Recherche web, chiffres à jour, structuration. Tu peux filer
              ailleurs : ça continue en arrière-plan et apparaîtra ici tout seul.
            </p>
          </>
        )}

        {!busy && !cours && entries.length === 0 && (
          <>
            <p className="max-w-3xl font-serif text-2xl leading-snug">
              Rien ici pour l&apos;instant. Laisse l&apos;IA écrire le cours de
              fond (sourcé, à jour) : le tuteur t&apos;enseignera ensuite pas à pas.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
              <PrepareButton slug={dossier.slug} mode="skeleton">
                Écrire le cours
              </PrepareButton>
            </div>
          </>
        )}

        {!busy && !cours && entries.length > 0 && (
          <div className="mb-8 flex flex-wrap items-center gap-x-4 gap-y-3">
            <PrepareButton slug={dossier.slug} mode="cours">
              Écrire le cours de fond
            </PrepareButton>
            <span className="text-sm text-muted-foreground">
              tu as déjà de la matière — l&apos;IA en fait un vrai cours structuré
            </span>
          </div>
        )}

        {cours && (
          <div className="max-w-3xl">
            <p className="border-l-2 border-primary pl-5 font-serif text-xl leading-relaxed text-foreground/90">
              {cours.enjeu}
            </p>
            <ol className="mt-8 space-y-2">
              {cours.sections.map((s, i) => (
                <li key={i} className="flex items-baseline gap-3 text-[15px]">
                  <span className="font-mono text-xs text-muted-foreground">
                    {i + 1}
                  </span>
                  <span>{s.titre}</span>
                </li>
              ))}
            </ol>
            <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-3">
              <Button asChild>
                <Link href={`/d/${dossier.slug}/lecon`}>
                  {coursFini
                    ? "Discuter avec le professeur"
                    : dossier.lecon
                      ? "Continuer la leçon"
                      : "Commencer la leçon"}
                </Link>
              </Button>
              {cardsCount > 0 && (
                <Button variant="outline" asChild>
                  <Link href={`/reviser?d=${dossier.slug}`}>
                    Réviser ce sujet ({cardsCount})
                  </Link>
                </Button>
              )}
              {!busy && (
                <PrepareButton
                  slug={dossier.slug}
                  mode="cours"
                  variant="ghost"
                  size="sm"
                >
                  Regénérer le plan
                </PrepareButton>
              )}
            </div>
          </div>
        )}

      </section>

      {/* Te confronter — fonction secondaire, volontairement discrète */}
      <section id="confronter" className="scroll-mt-6 border-b border-border py-6">
        <h2 className="flex items-center gap-2 font-serif text-xl">
          <span className={coursFini ? "" : "text-muted-foreground"}>
            Te confronter
          </span>
          {!coursFini && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
              <Lock className="size-3" />
              verrouillé
            </span>
          )}
        </h2>
        {coursFini ? (
          <p className="mt-1 text-[15px] text-muted-foreground">
            Optionnel, un jeu pour tester tes idées : fais-toi enseigner, attaquer,
            contredire. Du plus doux au plus coriace.
          </p>
        ) : (
          <p className="mt-1 max-w-2xl text-[15px] text-muted-foreground">
            Termine d&apos;abord le cours : la confrontation se débloque une fois la
            leçon bouclée. Le cours est l&apos;arme, les flashcards et l&apos;opposition
            sont les munitions, on charge avant de tirer.
          </p>
        )}

        {coursFini && ongoing.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">À reprendre :</span>
            {ongoing.map((c) => (
              <Button key={c.id} variant="outline" size="sm" asChild>
                <Link href={`/d/${dossier.slug}/debat?mode=${c.mode}`}>
                  {MODE_LABELS[c.mode] ?? c.mode} ↺
                </Link>
              </Button>
            ))}
          </div>
        )}

        {coursFini ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {debateModes.map((m) => (
              <Link
                key={m.value}
                href={`/d/${dossier.slug}/debat?mode=${m.value}`}
                title={m.desc}
                className="rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                {m.label}
              </Link>
            ))}
          </div>
        ) : (
          <div
            aria-disabled
            title="Termine le cours pour débloquer"
            className="mt-4 flex select-none flex-wrap gap-2 opacity-30 blur-[1.5px] grayscale [pointer-events:none]"
          >
            {debateModes.map((m) => (
              <span
                key={m.value}
                className="rounded-full border border-border bg-secondary/40 px-3 py-1.5 text-sm text-muted-foreground"
              >
                {m.label}
              </span>
            ))}
          </div>
        )}

        {debats.length > 0 && (
          <div className="mt-8">
            <p className="text-[15px] text-muted-foreground">Tes débats</p>
            {debats.map((d) => {
              let debrief: {
                resume?: string;
                difficultes?: string[];
                faits_manquants?: string[];
                a_approfondir?: string[];
              } = {};
              try {
                debrief = JSON.parse(d.debrief ?? "{}");
              } catch {}
              return (
                <div key={d.id} className="border-b border-border py-5">
                  <p className="text-sm text-muted-foreground">
                    <span className="font-mono">{d.created_at.slice(0, 10)}</span>
                    <span className="ml-3">{MODE_LABELS[d.mode] ?? d.mode}</span>
                  </p>
                  {debrief.resume && (
                    <p className="mt-2 max-w-3xl font-serif text-lg leading-relaxed">
                      {debrief.resume}
                    </p>
                  )}
                  {!!debrief.difficultes?.length && (
                    <div className="mt-3 text-[15px]">
                      <p className="text-destructive">
                        Ce qui m&apos;a mis en difficulté
                      </p>
                      <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                        {debrief.difficultes.map((x, i) => (
                          <li key={i}>{x}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {!!debrief.faits_manquants?.length && (
                    <div className="mt-3 text-[15px]">
                      <p>Faits qui me manquaient</p>
                      <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                        {debrief.faits_manquants.map((x, i) => (
                          <li key={i}>{x}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {!!debrief.a_approfondir?.length && (
                    <div className="mt-3 text-[15px]">
                      <p>À approfondir</p>
                      <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                        {debrief.a_approfondir.map((x, i) => (
                          <li key={i}>{x}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Plus : tout le secondaire dans UN seul tiroir repliable */}
      <section className="py-6">
        <details>
          <summary className="cursor-pointer list-none text-[15px] text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
            + Plus (chiffres, ressources, notes, lectures, vidéos)
          </summary>
          <div className="mt-6">
      {/* Chiffres & matière première (faits, écoles, arguments…) */}
      {entries.length > 0 && (
        <section className="border-b border-border py-8">
          <h2 className="font-serif text-2xl">
            Chiffres clés &amp; matière première
          </h2>
          <div className="mt-5">
            <Tabs defaultValue="faits" className="mt-2">
              <TabsList className="h-auto max-w-full flex-wrap justify-start gap-x-7 gap-y-1 rounded-none bg-transparent p-0 group-data-horizontal/tabs:h-auto">
                {TYPES.map((t) => (
                  <TabsTrigger
                    key={t.tab}
                    value={t.tab}
                    className={tabTriggerClass}
                  >
                    {t.label}
                    <span className="ml-2 font-mono text-xs tabular-nums">
                      {byType(t.type).length}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
              {TYPES.map((t) => (
                <TabsContent key={t.tab} value={t.tab} className="mt-2">
                  {t.type === "fait" && byType("fait").length > 0 && !busy && (
                    <div className="flex flex-wrap items-center gap-4 pb-3">
                      <PrepareButton
                        slug={dossier.slug}
                        mode="refresh"
                        variant="ghost"
                        size="sm"
                      >
                        Actualiser les faits (web)
                      </PrepareButton>
                      <span className="text-sm text-muted-foreground">
                        {unverified > 0
                          ? `${unverified} fait${unverified > 1 ? "s" : ""} sans lien cliquable`
                          : "chiffres à jour, sources cliquables"}
                      </span>
                    </div>
                  )}
                  {byType(t.type).map((e) =>
                    t.type === "fait" ? (
                      <FaitRow
                        key={e.id}
                        entry={e}
                        slug={dossier.slug}
                        dossierId={dossier.id}
                      />
                    ) : (
                      <EntryRow
                        key={e.id}
                        entry={e}
                        slug={dossier.slug}
                        dossierId={dossier.id}
                      />
                    )
                  )}
                  <AddEntryForm dossierId={dossier.id} type={t.type} />
                </TabsContent>
              ))}
            </Tabs>
          </div>
        </section>
      )}
      {/* Ressources : composant smart (cartes, tri par type, points repliés) */}
      {ressources.length > 0 && (
        <section className="border-b border-border py-8">
          <RessourceList ressources={ressources} slug={dossier.slug} />
        </section>
      )}

      {/* Annexes */}
      <section className="border-b border-border py-6">
        <details open={dossier.notes.trim().length > 0}>
          <summary className="cursor-pointer list-none text-[15px] text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
            + Notes (ton brouillon de travail)
          </summary>
          <div className="mt-5 max-w-4xl">
            <NotesEditor dossierId={dossier.id} initial={dossier.notes} />
          </div>
        </details>
      </section>

      {(livres.length > 0 || entries.length > 0) && (
        <section className="border-b border-border py-10">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[15px] text-muted-foreground">À lire</p>
            <form action={actionRecommendBooks}>
              <input type="hidden" name="slug" value={dossier.slug} />
              <SubmitButton
                variant="ghost"
                size="sm"
                pendingLabel="Le mentor choisit…"
              >
                {livres.length ? "Une autre" : "Une recommandation"}
              </SubmitButton>
            </form>
          </div>
          {livres.length === 0 ? (
            <p className="max-w-3xl text-[15px] text-muted-foreground">
              Le mentor te proposera une lecture dès qu&apos;il y aura assez de
              matière dans ce dossier.
            </p>
          ) : (
            <div className="space-y-6">
              {livres.map((l) => (
                <div key={l.id} className="group flex gap-5">
                  <a
                    href={l.buy_url ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0"
                  >
                    {l.cover_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={l.cover_url}
                        alt={l.titre}
                        className={`h-28 w-20 rounded-sm border border-border object-cover transition-opacity group-hover:opacity-80 ${l.lu ? "opacity-50" : ""}`}
                      />
                    ) : (
                      <div className="flex h-28 w-20 items-center justify-center rounded-sm border border-border bg-secondary p-2 text-center font-serif text-xs text-muted-foreground">
                        {l.titre}
                      </div>
                    )}
                  </a>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`font-serif text-lg ${l.lu ? "text-muted-foreground line-through" : ""}`}
                    >
                      {l.titre}
                      <span className="text-muted-foreground"> · {l.auteur}</span>
                    </p>
                    <p className="mt-1 max-w-3xl text-[15px] leading-relaxed text-muted-foreground">
                      {l.pourquoi}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs text-muted-foreground">
                      {l.pages && <span className="text-info">{l.pages} p.</span>}
                      {l.tradition && (
                        <span className="uppercase tracking-wider">
                          {l.tradition}
                        </span>
                      )}
                      {l.buy_url && (
                        <a
                          href={l.buy_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:text-foreground"
                        >
                          acheter ↗
                        </a>
                      )}
                      <form action={actionToggleBook}>
                        <input type="hidden" name="id" value={l.id} />
                        <button
                          type="submit"
                          className={`transition-colors ${l.lu ? "text-ok" : "hover:text-foreground"}`}
                        >
                          {l.lu ? "lu ✓" : "marquer lu"}
                        </button>
                      </form>
                      <form action={actionDeleteBook}>
                        <input type="hidden" name="id" value={l.id} />
                        <button
                          type="submit"
                          className="opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                        >
                          retirer
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {videos.length > 0 && (
        <section className="py-10">
          <p className="mb-5 text-[15px] text-muted-foreground">
            Vidéos qui ont nourri ce dossier
          </p>
          <div className="grid grid-cols-2 gap-x-5 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
            {videos.map((v) => (
              <a
                key={v.id}
                href={v.url}
                target="_blank"
                rel="noreferrer"
                className="group"
              >
                <div className="relative aspect-video overflow-hidden rounded-sm border border-border bg-secondary">
                  {v.video_id && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumbnailUrl(v.video_id)}
                      alt={v.titre ?? "Vidéo"}
                      className="h-full w-full object-cover transition-opacity group-hover:opacity-80"
                    />
                  )}
                  <span className="absolute bottom-1 right-1 rounded bg-background/80 px-1.5 py-0.5 font-mono text-[10px] text-info">
                    {v.nb_entries} extraits
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-[13px] leading-snug transition-colors group-hover:text-primary">
                  {v.titre ?? v.url}
                </p>
              </a>
            ))}
          </div>
        </section>
      )}

            {ressources.length + entries.length > 0 && (
              <div className="py-6">
                <form action={actionDetectSplits.bind(null, dossier.slug)}>
                  <SubmitButton
                    variant="ghost"
                    size="sm"
                    pendingLabel="Socrates athe userse…"
                  >
                    Athe userser ce dossier (un sujet à en sortir ?)
                  </SubmitButton>
                </form>
              </div>
            )}
          </div>
        </details>
      </section>
    </div>
  );
}
