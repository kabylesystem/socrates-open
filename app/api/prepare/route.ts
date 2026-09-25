import { NextRequest } from "next/server";
import {
  acquireGenLock,
  addEntry,
  countBooks,
  deleteEntriesOfType,
  getDossier,
  saveBooks,
  saveCours,
  setGenError,
  setGenProgress,
  setGenStatus,
} from "@/lib/db";
import {
  generateCourse,
  generateSkeletonLive,
  recommendBooks,
} from "@/lib/ai";

// On enregistre seulement le cours. Les flashcards ne se créent PAS ici : elles se
// GAGNENT au fil de la leçon (carte par carte, par étape) ou via une ressource
// ingérée (lien article/X/YouTube déjà vu). Jamais un deck pré-mâché d'un cours non étudié.
function enregistrerCours(
  dossierId: number,
  cours: { enjeu: string; sections: { titre: string; corps: string }[] }
) {
  saveCours(dossierId, JSON.stringify(cours));
}
import { enrichBook } from "@/lib/books";

export const runtime = "nodejs";
export const maxDuration = 300;

// Transforme une erreur technique en message clair pour l'utilisateur.
function humanizeGenError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/credit|balance|quota|insufficient|429|rate.?limit|limite/i.test(msg))
    return "Le forfait Claude n'a plus de crédits (ou la limite est atteinte). Réessaie plus tard, ou vérifie ton solde.";
  return "La génération a échoué (souci technique ou réseau). Tu peux réessayer.";
}

// Génération EN ARRIÈRE-PLAN : répond tout de suite, le travail continue côté
// serveur pendant que the user navigue ailleurs. La page repasse à l'état normal
// quand gen_status = idle.
//  - skeleton : le COURS de fond (sourcé) + les faits/écoles/arguments (preuves) + lectures
//  - cours    : (re)génère seulement le cours de fond
//  - refresh  : réactualise seulement les faits chiffrés (web)
export async function POST(req: NextRequest) {
  const { slug, mode } = (await req.json()) as {
    slug: string;
    mode: "skeleton" | "refresh" | "cours";
  };
  const dossier = getDossier(slug);
  if (!dossier) return new Response("Dossier inconnu", { status: 404 });
  // Verrou atomique : si on ne l'obtient pas, une génération tourne déjà.
  if (!acquireGenLock(dossier.id)) return new Response(null, { status: 202 });

  void (async () => {
    try {
      const onProgress = (d: number, t: number) =>
        setGenProgress(dossier.id, d, t);

      if (mode === "cours") {
        const cours = await generateCourse(dossier.nom, onProgress);
        if (cours) enregistrerCours(dossier.id, cours);
        return;
      }

      if (mode === "refresh") {
        const { skeleton, web } = await generateSkeletonLive(dossier.nom);
        if (skeleton && web) {
          deleteEntriesOfType(dossier.id, "fait");
          for (const f of skeleton.faits)
            addEntry(dossier.id, "fait", f.texte, f.valeur, f.source, f.source_url);
        }
        return;
      }

      // mode "skeleton" : le cours (fondation) ET les faits (preuves), en parallèle.
      let genErr: unknown = null;
      const [cours, sk] = await Promise.all([
        generateCourse(dossier.nom, onProgress).catch((e) => {
          genErr = e;
          return null;
        }),
        generateSkeletonLive(dossier.nom).catch((e) => {
          genErr = e;
          return null;
        }),
      ]);
      // Rien produit du tout : on fait remonter l'erreur (transparence).
      if (!cours && !sk?.skeleton && genErr) throw genErr;
      if (cours) enregistrerCours(dossier.id, cours);
      if (sk?.skeleton) {
        const { skeleton } = sk;
        for (const f of skeleton.faits)
          addEntry(dossier.id, "fait", f.texte, f.valeur, f.source, f.source_url);
        for (const e of skeleton.ecoles) addEntry(dossier.id, "ecole", e.texte);
        for (const a of skeleton.arguments)
          addEntry(dossier.id, "argument", a.texte);
        for (const c of skeleton.contre_arguments)
          addEntry(dossier.id, "contre", c.texte);
        for (const q of skeleton.questions)
          addEntry(dossier.id, "question", q.texte);
        if (countBooks(dossier.id) === 0) {
          const r = await recommendBooks(dossier, []);
          if (r?.livres?.length) {
            const enrichis = await Promise.all(
              r.livres.map(async (l) => ({
                ...l,
                ...(await enrichBook(l.titre, l.auteur)),
              }))
            );
            saveBooks(dossier.id, enrichis);
          }
        }
      }
    } catch (e) {
      // Transparence : on mémorise un message clair (crédits vs technique).
      setGenError(dossier.id, humanizeGenError(e));
    } finally {
      setGenStatus(dossier.id, "idle");
    }
  })();

  return new Response(null, { status: 202 });
}
