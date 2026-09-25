"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addBookNote,
  addEntry,
  appendNotes,
  clipToNotes,
  createRessource,
  deleteRessource,
  getRessource,
  gradeDossierCard,
  deleteDossierCard,
  restoreDossierCard,
  listRessources,
  materialCount,
  moveEntriesToDossier,
  moveRessourcesToDossier,
  saveSplitSuggestion,
  saveDossierCards,
  saveLesson,
  checkpointConversation,
  countBooks,
  countDossierCards,
  countEntries,
  createBook,
  createDossier,
  deleteBook,
  deleteBookEntity,
  deleteBookNote,
  deleteEntriesOfType,
  deleteEntry,
  getBook,
  getDossier,
  getDossierById,
  gradeRevision,
  listBookNotes,
  listDebats,
  listDossiers,
  listEntries,
  type Dossier,
  replaceContradictions,
  resolveContradiction,
  saveBookCards,
  saveBookSynthese,
  saveBookChapters,
  saveBooks,
  saveDebat,
  saveExamen,
  saveIngest,
  saveVideo,
  setBookDossiers,
  toggleBook,
  updateBookBefore,
  updateBookStatus,
  updateNotes,
  updatePosition,
  type Entry,
} from "@/lib/db";
import {
  categorizeDossier,
  correctExam,
  correctExamFromPhotos,
  detectContradictions,
  detectSplits,
  extractChaptersFromText,
  extractFromContent,
  fetchBookChapters,
  identifyBook,
  generateBookCards,
  generateCardFromClip,
  generateCards,
  generateCardsFromResource,
  ingestResource,
  generateDebrief,
  generateExamSubject,
  generateSkeletonLive,
  recommendBooks,
  synthesizeBook,
  synthesizePosition,
  type ExamImage,
} from "@/lib/ai";
import { getTranscript, thumbnailUrl, youtubeId } from "@/lib/youtube";
import { enrichBook } from "@/lib/books";
import { fetchUrlContent, isBareUrl } from "@/lib/web";

export async function actionUpdatePosition(formData: FormData) {
  const dossierId = Number(formData.get("dossierId"));
  const position = String(formData.get("position") ?? "");
  const confiance = Math.min(
    100,
    Math.max(0, Number(formData.get("confiance") ?? 50))
  );
  updatePosition(dossierId, position, confiance);
  const dossier = getDossierById(dossierId);
  if (dossier) await maybeRecommendBooks(dossier);
  revalidatePath("/", "layout");
}

export async function actionUpdateNotes(dossierId: number, notes: string) {
  updateNotes(dossierId, notes);
}

export async function actionAppendNote(dossierId: number, texte: string) {
  appendNotes(dossierId, texte);
  revalidatePath("/", "layout");
}

// Reprise de leçon : on sauve l'état (étape, messages, couverture) côté serveur.
export async function actionSaveLesson(slug: string, state: unknown) {
  const dossier = getDossier(slug);
  if (!dossier) return;
  saveLesson(dossier.id, JSON.stringify(state));
}

// Au fil de la leçon : dès qu'une étape (une section du cours) est conclue, on en
// fabrique les flashcards tout seul, sans clic. Ciblé sur cette seule section ;
// saveDossierCards dédoublonne et préserve les streaks, donc c'est rejouable.
export async function actionGenerateStepCards(
  slug: string,
  sectionTitre: string
): Promise<number | undefined> {
  const dossier = getDossier(slug);
  if (!dossier?.cours) return;
  let cours: { enjeu: string; sections: { titre: string; corps: string }[] };
  try {
    cours = JSON.parse(dossier.cours);
  } catch {
    return;
  }
  const section = cours.sections.find((s) => s.titre === sectionTitre);
  if (!section) return countDossierCards(dossier.id);
  const result = await generateCards(dossier.nom, {
    enjeu: cours.enjeu,
    sections: [section],
  });
  if (result?.cards?.length) saveDossierCards(dossier.id, result.cards);
  revalidatePath(`/d/${slug}`);
  // Le total après ajout : le client anime le compteur jusqu'à cette valeur.
  return countDossierCards(dossier.id);
}

export async function actionGradeDossierCard(id: number, quality: number) {
  gradeDossierCard(id, quality);
}

export async function actionDeleteDossierCard(id: number) {
  deleteDossierCard(id);
}

export async function actionRestoreDossierCard(
  id: number,
  interval: number,
  streak: number,
  ease: number
) {
  restoreDossierCard(id, interval, streak, ease);
}

// Clippe une sélection du tuteur dans les notes, rangée sous le chapitre.
// Surligner → notes ET une flashcard sur mesure (le surlignage est un signal fort :
// ce que the user clippe mérite SA carte). Renvoie le total de cartes (pour l'animation).
export async function actionClipToNotes(
  slug: string,
  chapitre: string,
  texte: string
): Promise<number | undefined> {
  const t = texte.trim();
  if (!t) return;
  const dossier = getDossier(slug);
  if (!dossier) return;
  clipToNotes(dossier.id, chapitre, t);
  const card = await generateCardFromClip(dossier.nom, chapitre, t).catch(
    () => null
  );
  if (card?.cards?.length) saveDossierCards(dossier.id, card.cards.slice(0, 1));
  revalidatePath(`/d/${slug}`);
  return countDossierCards(dossier.id);
}

// L'IA propose une première formulation de la position depuis l'engagement de the user.
export async function actionSynthesizePosition(formData: FormData) {
  const slug = String(formData.get("slug"));
  const dossier = getDossier(slug);
  if (!dossier) return;
  const debriefs = listDebats(dossier.id)
    .map((d) => {
      try {
        const j = JSON.parse(d.debrief ?? "{}");
        return [j.resume, ...(j.difficultes ?? [])].filter(Boolean).join(" — ");
      } catch {
        return "";
      }
    })
    .filter(Boolean);
  const result = await synthesizePosition(
    dossier,
    listEntries(dossier.id),
    debriefs
  );
  if (result)
    updatePosition(
      dossier.id,
      result.position,
      Math.round(result.confiance)
    );
  revalidatePath("/", "layout");
}

export async function actionAddEntry(formData: FormData) {
  const dossierId = Number(formData.get("dossierId"));
  const type = String(formData.get("type")) as Entry["type"];
  const texte = String(formData.get("texte") ?? "").trim();
  const valeur = String(formData.get("valeur") ?? "").trim() || null;
  const source = String(formData.get("source") ?? "").trim() || null;
  if (texte) addEntry(dossierId, type, texte, valeur, source);
  revalidatePath("/", "layout");
}

export async function actionDeleteEntry(formData: FormData) {
  deleteEntry(Number(formData.get("entryId")));
  revalidatePath("/", "layout");
}

export async function actionGenerateSkeleton(formData: FormData) {
  const slug = String(formData.get("slug"));
  const dossier = getDossier(slug);
  if (!dossier) return;
  const { skeleton } = await generateSkeletonLive(dossier.nom);
  if (!skeleton) return;
  for (const f of skeleton.faits)
    addEntry(dossier.id, "fait", f.texte, f.valeur, f.source, f.source_url);
  for (const e of skeleton.ecoles) addEntry(dossier.id, "ecole", e.texte);
  for (const a of skeleton.arguments)
    addEntry(dossier.id, "argument", a.texte);
  for (const c of skeleton.contre_arguments)
    addEntry(dossier.id, "contre", c.texte);
  for (const q of skeleton.questions)
    addEntry(dossier.id, "question", q.texte);
  await maybeRecommendBooks(dossier);
  revalidatePath("/", "layout");
}

// Actualise les faits d'un dossier par recherche web (stats à jour + liens).
export async function actionRefreshFacts(formData: FormData) {
  const slug = String(formData.get("slug"));
  const dossier = getDossier(slug);
  if (!dossier) return;
  const { skeleton, web } = await generateSkeletonLive(dossier.nom);
  if (!skeleton || !web) return; // pas de remplacement si la recherche web a échoué
  deleteEntriesOfType(dossier.id, "fait");
  for (const f of skeleton.faits)
    addEntry(dossier.id, "fait", f.texte, f.valeur, f.source, f.source_url);
  revalidatePath("/", "layout");
}

export type IngestResult =
  | {
      ok: true;
      titre: string;
      resume: string;
      thumbnail: string | null;
      items: { dossier: string; type: string; texte: string }[];
    }
  | { ok: false; error: string };

const YOUTUBE_RE =
  /https?:\/\/(www\.)?(youtube\.com\/watch\?\S+|youtu\.be\/\S+|youtube\.com\/shorts\/\S+)/i;

export async function actionIngest(
  _prev: IngestResult | null,
  formData: FormData
): Promise<IngestResult> {
  const contenu = String(formData.get("contenu") ?? "").trim();
  if (!contenu)
    return { ok: false, error: "Colle un lien YouTube ou du texte." };

  const ytMatch = contenu.match(YOUTUBE_RE);
  const dossiers = listDossiers();

  // --- Lien YouTube : on garde le comportement vidéo (transcript -> extraits) ---
  if (ytMatch && contenu.length < ytMatch[0].length + 80) {
    const url = ytMatch[0];
    let texte: string;
    try {
      texte = (await getTranscript(url)).text;
    } catch {
      return {
        ok: false,
        error:
          "Impossible de récupérer le transcript (vidéo sans sous-titres, ou lien invalide).",
      };
    }
    const extraction = await extractFromContent(
      texte,
      `Vidéo YouTube : ${url}`,
      dossiers
    );
    if (!extraction) return { ok: false, error: "Extraction échouée." };
    const placed: { dossier: string; type: string; texte: string }[] = [];
    const parDossier = new Map<number, number>();
    for (const item of extraction.items) {
      let dossier = dossiers.find((d) => d.slug === item.dossier) ?? null;
      if (!dossier && item.dossier.startsWith("nouveau:"))
        dossier = createDossier(
          item.dossier.slice("nouveau:".length).trim(),
          item.categorie?.trim() || "Divers"
        );
      if (!dossier) continue;
      addEntry(
        dossier.id,
        item.type,
        item.texte,
        item.valeur,
        `YouTube · ${extraction.titre_devine}`,
        url
      );
      placed.push({ dossier: dossier.nom, type: item.type, texte: item.texte });
      parDossier.set(dossier.id, (parDossier.get(dossier.id) ?? 0) + 1);
    }
    const vid = youtubeId(url);
    saveVideo(
      url,
      vid,
      extraction.titre_devine,
      extraction.resume,
      [...parDossier].map(([dossierId, nb]) => ({ dossierId, nb }))
    );
    revalidatePath("/", "layout");
    return {
      ok: true,
      titre: extraction.titre_devine,
      resume: extraction.resume,
      thumbnail: vid ? thumbnailUrl(vid) : null,
      items: placed,
    };
  }

  // --- Texte collé OU lien (tweet/thread X, article…) : devient une RESSOURCE ---
  // Si c'est un simple lien, on va LIRE la page derrière (r.jina.ai).
  let resourceText = contenu;
  let sourceLabel = "Texte collé (tweet, conversation, article…)";
  const bareUrl = isBareUrl(contenu);
  if (bareUrl) {
    const fetched = await fetchUrlContent(bareUrl);
    if (!fetched)
      return {
        ok: false,
        error:
          "Je n'ai pas réussi à lire cette page (X bloque parfois la lecture). Colle plutôt le texte du thread directement, ça marche à tous les coups.",
      };
    resourceText = fetched;
    sourceLabel = `Lien : ${bareUrl}`;
  }
  const r = await ingestResource(resourceText, sourceLabel, dossiers).catch(
    () => null
  );
  if (!r)
    return {
      ok: false,
      error:
        "Je n'ai pas réussi à athe userser cette ressource (peut-être un manque de crédits, ou un texte trop long ou inhabituel). Réessaie, ou raccourcis un peu le contenu.",
    };
  let dossier = dossiers.find((d) => d.slug === r.dossier) ?? null;
  if (!dossier && r.dossier.startsWith("nouveau:"))
    dossier = createDossier(
      r.dossier.slice("nouveau:".length).trim(),
      r.categorie?.trim() || "Divers"
    );
  if (!dossier) return { ok: false, error: "Sujet introuvable." };
  createRessource(dossier.id, {
    type: r.type,
    titre: r.titre,
    source: r.source ?? (bareUrl || null),
    contenu: resourceText,
    resume: r.resume,
    points: r.points,
  });
  saveIngest("ressource", r.titre, r.resume, 1);
  // Si le sujet s'épaissit, Socrates athe userse en arrière-plan s'il faut en sortir
  // un sous-thème en sujet à part (« tu zoomes trop »).
  if (materialCount(dossier.id) >= 5) {
    const did = dossier.id;
    const dnom = dossier.nom;
    void runSplitDetection(did, dnom).catch(() => {});
  }
  revalidatePath("/", "layout");
  return {
    ok: true,
    titre: r.titre,
    resume: r.resume,
    thumbnail: null,
    items: [{ dossier: dossier.nom, type: r.type, texte: r.titre }],
  };
}

// Génère des flashcards depuis une ressource (le pont ressource -> rétention).
export async function actionCardsFromRessource(id: number, slug: string) {
  const r = getRessource(id);
  if (!r) return;
  const dossier = getDossierById(r.dossier_id);
  if (!dossier) return;
  const result = await generateCardsFromResource(
    dossier.nom,
    r.titre,
    r.resume ? `${r.resume}\n\n${r.contenu}` : r.contenu
  );
  if (result?.cards?.length) saveDossierCards(dossier.id, result.cards);
  revalidatePath(`/d/${slug}`);
}

export async function actionDeleteRessource(id: number, slug: string) {
  deleteRessource(id);
  revalidatePath(`/d/${slug}`);
}

// ---------- « Tu zoomes trop » : détecter un sous-thème à sortir en sujet ----------

async function runSplitDetection(dossierId: number, nom: string) {
  const ress = listRessources(dossierId);
  const ents = listEntries(dossierId);
  const rTxt = ress.length
    ? ress
        .map(
          (r) =>
            `- ID ${r.id} [${r.type}] ${r.titre}${r.resume ? " — " + r.resume : ""}`
        )
        .join("\n")
    : "(aucune)";
  const eTxt = ents.length
    ? ents
        .map(
          (e) =>
            `- ID ${e.id} [${e.type}] ${e.texte}${e.valeur ? " (" + e.valeur + ")" : ""}`
        )
        .join("\n")
    : "(aucun)";
  const material = `RESSOURCES :\n${rTxt}\n\nÉLÉMENTS :\n${eTxt}`;
  const result = await detectSplits(nom, material);
  saveSplitSuggestion(
    dossierId,
    result?.splits?.length ? JSON.stringify(result.splits) : null
  );
}

export async function actionDetectSplits(slug: string) {
  const dossier = getDossier(slug);
  if (!dossier) return;
  await runSplitDetection(dossier.id, dossier.nom);
  revalidatePath(`/d/${slug}`);
}

type Split = {
  nom: string;
  categorie: string | null;
  raison: string;
  ressourceIds: number[];
  entryIds: number[];
};

export async function actionApplySplit(slug: string, index: number) {
  const dossier = getDossier(slug);
  if (!dossier?.split_suggestion) return;
  let splits: Split[];
  try {
    splits = JSON.parse(dossier.split_suggestion);
  } catch {
    return;
  }
  const split = splits[index];
  if (!split) return;
  const newDossier = createDossier(
    split.nom,
    split.categorie?.trim() || dossier.categorie || "Divers"
  );
  if (Array.isArray(split.ressourceIds))
    moveRessourcesToDossier(split.ressourceIds, newDossier.id);
  if (Array.isArray(split.entryIds))
    moveEntriesToDossier(split.entryIds, newDossier.id);
  const rest = splits.filter((_, i) => i !== index);
  saveSplitSuggestion(dossier.id, rest.length ? JSON.stringify(rest) : null);
  revalidatePath("/", "layout");
  redirect(`/d/${newDossier.slug}`);
}

export async function actionDismissSplit(slug: string, index: number) {
  const dossier = getDossier(slug);
  if (!dossier?.split_suggestion) return;
  let splits: Split[];
  try {
    splits = JSON.parse(dossier.split_suggestion);
  } catch {
    return;
  }
  const rest = splits.filter((_, i) => i !== index);
  saveSplitSuggestion(dossier.id, rest.length ? JSON.stringify(rest) : null);
  revalidatePath(`/d/${slug}`);
}

// Checkpoint : sauvegarde la conversation en cours (reprenable plus tard)
export async function actionCheckpoint(
  slug: string,
  mode: string,
  transcript: { role: "user" | "assistant"; content: string }[]
) {
  const dossier = getDossier(slug);
  if (!dossier || transcript.length === 0) return;
  checkpointConversation(dossier.id, mode, JSON.stringify(transcript));
}

export async function actionSaveDebate(
  slug: string,
  mode: string,
  transcript: { role: "user" | "assistant"; content: string }[]
): Promise<string | null> {
  const dossier = getDossier(slug);
  if (!dossier || transcript.length === 0) return null;
  const debrief = await generateDebrief(dossier.nom, mode, transcript);
  if (!debrief) return null;
  saveDebat(
    dossier.id,
    mode,
    JSON.stringify(transcript),
    JSON.stringify(debrief)
  );
  revalidatePath("/", "layout");
  return JSON.stringify(debrief);
}

export async function actionDetectContradictions() {
  const result = await detectContradictions(listDossiers());
  if (result) replaceContradictions(result.contradictions);
  revalidatePath("/", "layout");
}

export async function actionResolveContradiction(formData: FormData) {
  resolveContradiction(Number(formData.get("id")));
  revalidatePath("/", "layout");
}

export async function actionCreateDossier(formData: FormData) {
  const nom = String(formData.get("nom") ?? "").trim();
  if (!nom) return;
  let categorie = String(formData.get("categorie") ?? "").trim();
  if (!categorie) {
    const categories = [
      ...new Set(listDossiers().map((d) => d.categorie)),
    ];
    categorie = await categorizeDossier(nom, categories);
  }
  createDossier(nom, categorie);
  revalidatePath("/", "layout");
}

// ---------- Examen du week-end ----------

export async function actionExamSubject(
  slug: string
): Promise<{ sujet: string; cadrage: string } | null> {
  const dossier = getDossier(slug);
  if (!dossier) return null;
  const result = await generateExamSubject(dossier.nom);
  return result ?? null;
}

export async function actionSubmitExam(
  slug: string,
  sujet: string,
  copie: string,
  images?: ExamImage[]
): Promise<string | null> {
  const dossier = getDossier(slug);
  if (!dossier) return null;
  const trimmed = copie.trim();

  if (images && images.length > 0) {
    const result = await correctExamFromPhotos(dossier.nom, sujet, images);
    saveExamen(
      dossier.id,
      sujet,
      result?.transcription ?? "(copie photographiée)",
      result ? JSON.stringify(result) : null
    );
    revalidatePath("/examen");
    return result ? JSON.stringify(result) : null;
  }

  if (!trimmed) {
    saveExamen(dossier.id, sujet, null, null);
    revalidatePath("/examen");
    return null;
  }
  const correction = await correctExam(dossier.nom, sujet, trimmed);
  saveExamen(
    dossier.id,
    sujet,
    trimmed,
    correction ? JSON.stringify(correction) : null
  );
  revalidatePath("/examen");
  return correction ? JSON.stringify(correction) : null;
}

export async function actionGradeRevision(entryId: number, su: boolean) {
  gradeRevision(entryId, su);
}

// ---------- Lectures ----------

async function recommandeEtEnrichit(dossier: Dossier) {
  const result = await recommendBooks(dossier, listEntries(dossier.id));
  if (!result?.livres?.length) return;
  const enrichis = await Promise.all(
    result.livres.map(async (l) => ({
      ...l,
      ...(await enrichBook(l.titre, l.auteur)),
    }))
  );
  saveBooks(dossier.id, enrichis);
}

// Reco automatique « quand il y a assez de data » (appelée après le terrain / la position)
async function maybeRecommendBooks(dossier: Dossier) {
  if (countBooks(dossier.id) > 0) return;
  const assezDeData =
    countEntries(dossier.id) >= 6 || !!dossier.position.trim();
  if (assezDeData) await recommandeEtEnrichit(dossier);
}

export async function actionRecommendBooks(formData: FormData) {
  const slug = String(formData.get("slug"));
  const dossier = getDossier(slug);
  if (!dossier) return;
  await recommandeEtEnrichit(dossier);
  revalidatePath("/", "layout");
}

export async function actionToggleBook(formData: FormData) {
  toggleBook(Number(formData.get("id")));
  revalidatePath("/", "layout");
}

export async function actionDeleteBook(formData: FormData) {
  deleteBook(Number(formData.get("id")));
  revalidatePath("/", "layout");
}

// Utilisé par la page débat (client) pour récupérer le contexte
export async function getDebateContext(slug: string) {
  const dossier = getDossier(slug);
  if (!dossier) return null;
  return { dossier, entries: listEntries(dossier.id) };
}

// ---------- Reading Space ----------

export async function actionCreateBook(formData: FormData) {
  const rawTitre = String(formData.get("titre") ?? "").trim();
  const rawAuteur = String(formData.get("auteur") ?? "").trim();
  if (!rawTitre || !rawAuteur) return;
  // Normalise la saisie (titre/auteur exacts + année) : fiabilise couverture ET
  // recherche du sommaire (une saisie approximative casse tout).
  const ident = await identifyBook(rawTitre, rawAuteur).catch(() => null);
  const titre = ident?.titre?.trim() || rawTitre;
  const auteur = ident?.auteur?.trim() || rawAuteur;
  const annee = ident?.annee ?? null;
  const { cover_url, buy_url } = await enrichBook(titre, auteur);
  const id = createBook(titre, auteur, cover_url, buy_url);
  // Le sommaire (robuste : recherche IA + filet lecture de page) en arrière-plan.
  void (async () => {
    try {
      const chaps = await robustBookChapters(titre, auteur, annee);
      if (chaps?.length) saveBookChapters(id, JSON.stringify(chaps));
    } catch {
      // tant pis : le bouton « Trouver le sommaire » reste disponible
    }
  })();
  revalidatePath("/lire");
  redirect(`/lire/${id}`);
}

// Trouve les chapitres d'un livre de façon ROBUSTE, sans aucune action de
// l'utilisateur : 1) recherche web par l'IA ; 2) si le résultat est maigre, le
// système lit lui-même une page de résultats web et en extrait le sommaire.
export async function robustBookChapters(
  titre: string,
  auteur: string,
  annee: string | null
): Promise<{ num: string; titre: string }[] | null> {
  const toc = await fetchBookChapters(titre, auteur, annee).catch(() => null);
  const fromWeb = toc?.chapitres ?? null;
  if (fromWeb && fromWeb.length >= 6) return fromWeb;
  // Filet : lire une page de résultats web et en extraire le sommaire.
  try {
    const q = encodeURIComponent(`"${titre}" ${auteur} table des matières sommaire`);
    const page = await fetchUrlContent(`https://www.google.com/search?q=${q}`);
    if (page) {
      const ext = await extractChaptersFromText(titre, auteur, page).catch(
        () => null
      );
      const fromPage = ext?.chapitres ?? null;
      if (
        fromPage &&
        (!fromWeb || fromPage.length > fromWeb.length)
      )
        return fromPage;
    }
  } catch {
    // on garde ce qu'on a
  }
  return fromWeb;
}

export async function actionFetchBookChapters(formData: FormData) {
  const id = Number(formData.get("bookId"));
  const book = getBook(id);
  if (!book) return;
  const chaps = await robustBookChapters(book.titre, book.auteur, null);
  if (chaps?.length) saveBookChapters(id, JSON.stringify(chaps));
  revalidatePath(`/lire/${id}`);
}

export async function actionUpdateBookBefore(formData: FormData) {
  const id = Number(formData.get("bookId"));
  updateBookBefore(
    id,
    String(formData.get("pourquoi") ?? "").trim(),
    String(formData.get("objectif") ?? "").trim()
  );
  revalidatePath(`/lire/${id}`);
}

export async function actionSetBookStatus(formData: FormData) {
  const id = Number(formData.get("bookId"));
  const statut = String(formData.get("statut")) as
    | "not_started"
    | "reading"
    | "finished"
    | "abandoned";
  updateBookStatus(id, statut);
  revalidatePath(`/lire/${id}`);
  revalidatePath("/lire");
}

export async function actionDeleteReadingBook(formData: FormData) {
  deleteBookEntity(Number(formData.get("bookId")));
  revalidatePath("/lire");
  redirect("/lire");
}

export async function actionAddBookNote(formData: FormData) {
  const id = Number(formData.get("bookId"));
  const contenu = String(formData.get("contenu") ?? "").trim();
  if (!contenu) return;
  const type = String(formData.get("type") ?? "idee") as
    | "chapitre"
    | "citation"
    | "idee"
    | "question"
    | "desaccord"
    | "argument";
  const chapitre = String(formData.get("chapitre") ?? "").trim() || null;
  addBookNote(id, type, contenu, chapitre);
  revalidatePath(`/lire/${id}`);
}

export async function actionDeleteBookNote(formData: FormData) {
  const id = Number(formData.get("bookId"));
  deleteBookNote(Number(formData.get("noteId")));
  revalidatePath(`/lire/${id}`);
}

export async function actionSynthesizeBook(formData: FormData) {
  const id = Number(formData.get("bookId"));
  const book = getBook(id);
  if (!book) return;
  const notes = listBookNotes(id).map((n) => ({
    type: n.type,
    contenu: n.chapitre ? `[ch. ${n.chapitre}] ${n.contenu}` : n.contenu,
  }));
  const dossiers = listDossiers();
  const result = await synthesizeBook(
    book.titre,
    book.auteur,
    notes,
    dossiers.map((d) => d.nom)
  );
  if (!result) return;
  saveBookSynthese(
    id,
    JSON.stringify({
      key_ideas: result.key_ideas,
      concepts: result.concepts,
      arguments: result.arguments,
      counterarguments: result.counterarguments,
      dossiers_suggeres: result.dossiers_suggeres,
    }),
    result.pensee_avant,
    result.pensee_apres,
    Math.round(result.conf_avant),
    Math.round(result.conf_apres)
  );
  // Relier aux dossiers existants suggérés (match par nom, souple)
  const norm = (s: string) => s.toLowerCase().trim();
  const ids = dossiers
    .filter((d) =>
      result.dossiers_suggeres.some(
        (s) => norm(s).includes(norm(d.nom)) || norm(d.nom).includes(norm(s))
      )
    )
    .map((d) => d.id);
  if (ids.length) setBookDossiers(id, ids);
  if (book.statut !== "finished") updateBookStatus(id, "finished");
  revalidatePath(`/lire/${id}`);
  revalidatePath("/lire");
}

export async function actionGenerateBookCards(formData: FormData) {
  const id = Number(formData.get("bookId"));
  const book = getBook(id);
  if (!book?.synthese) return;
  let plat = book.synthese;
  try {
    const s = JSON.parse(book.synthese);
    plat = [
      ...(s.key_ideas ?? []),
      ...(s.concepts ?? []),
      ...(s.arguments ?? []),
    ].join("\n");
  } catch {}
  const result = await generateBookCards(book.titre, book.auteur, plat);
  if (result?.cards?.length) saveBookCards(id, result.cards.slice(0, 15));
  revalidatePath(`/lire/${id}`);
}
