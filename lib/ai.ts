import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { Dossier, Entry } from "./db";
import { apiClient, completeJSON, completeText, streamText } from "./llm";

// Opus pour ce qui exige de l'intelligence (faits, débats, corrections, recherche).
export const MODEL = "claude-opus-4-8";
// Sonnet pour les tâches moyennes (extraction, explore, structuration, examen…).
const MODEL_MID = "claude-sonnet-4-6";
// Haiku pour le trivial (ranger un dossier dans une catégorie).
const MODEL_FAST = "claude-haiku-4-5";

// ---------- Squelette de dossier (cold start) ----------

const SkeletonSchema = z.object({
  faits: z.array(
    z.object({
      texte: z
        .string()
        .describe("L'énoncé du fait ; tout commentaire ou précision va ICI"),
      valeur: z
        .string()
        .describe(
          "Le chiffre, ABRÉGÉ et court (≤ 14 car.) : « 10,7 % », « ≈100 M », « 326 954 », « 14 Md€ », « 3 700 $ ». Abréviations M/Md/€/$ obligatoires, pas de mots comme « millions » ni « environ », jamais de parenthèse ni de phrase. Le contexte va dans le texte."
        ),
      source: z
        .string()
        .describe(
          "Source + année, ex: « INSEE · 2024 ». Utilise l'année la PLUS RÉCENTE que tu connais (2024/2025 de préférence)."
        ),
      source_url: z
        .string()
        .describe(
          "L'URL du site officiel de la source (page d'accueil de l'institution suffit : https://www.insee.fr, https://www.banque-france.fr…). URL réelle et plausible, jamais inventée de toutes pièces."
        ),
    })
  ),
  ecoles: z.array(
    z.object({
      texte: z.string().describe("Nom de l'école + sa position en 1-2 phrases"),
    })
  ),
  arguments: z.array(z.object({ texte: z.string() })),
  contre_arguments: z.array(z.object({ texte: z.string() })),
  questions: z.array(z.object({ texte: z.string() })),
});

const SKELETON_SYSTEM = `Tu alimentes Socrates, l'outil de travail politique personnel d'un futur candidat français qui veut sur-maîtriser chaque sujet. Tu produis le squelette factuel et intellectuel d'un dossier. Exigences : faits précis, chiffrés, sourcés (institutions réelles : INSEE, Cour des comptes, Eurostat, OFPRA, RTE…), avec les données LES PLUS RÉCENTES que tu connais (privilégie 2024/2025 ; date chaque chiffre) ; centrés sur la France et l'Europe quand pertinent ; écoles de pensée réellement distinctes ; arguments et contre-arguments du niveau des meilleurs débatteurs de chaque camp, pas des caricatures. Réponds en français.`;

const SKELETON_DEMANDE = (nom: string) =>
  `Construis le squelette du dossier « ${nom} » : 10 faits chiffrés sourcés (avec source_url), 5 écoles de pensée, 6 arguments (les plus forts toutes positions confondues), 6 contre-arguments, 5 questions ouvertes difficiles.`;

export async function generateSkeleton(nomDossier: string) {
  return completeJSON(SkeletonSchema, {
    model: MODEL,
    system: SKELETON_SYSTEM,
    prompt: SKELETON_DEMANDE(nomDossier),
  });
}

// ---------- Squelette « live » : recherche web pour des stats à jour ----------

async function researchFacts(nom: string): Promise<string> {
  return completeText({
    model: MODEL_MID, // extraction de chiffres sourcés : Sonnet suffit (et moins cher)
    web: true,
    system:
      "Tu es un chercheur de données chiffrées récentes et sourcées. Tu utilises la recherche web pour trouver les chiffres les plus à jour et leurs liens.",
    prompt: `Recherche sur le web les données chiffrées LES PLUS RÉCENTES (2024-2025) sur « ${nom} », centrées sur la France et l'Europe quand c'est pertinent. Donne 10 faits marquants. Pour CHAQUE fait, une seule ligne au format STRICT :
FAIT: <énoncé clair> | VALEUR: <le chiffre abrégé, ex 10,7 % / ≈100 M / 14 Md€> | SOURCE: <institution + année> | URL: <lien direct vers la page de la donnée>
Privilégie les sources officielles et récentes (INSEE, Eurostat, Banque de France, ministères, OCDE…). Donne l'URL la plus précise possible. Réponds UNIQUEMENT avec ces 10 lignes, rien d'autre.`,
  });
}

// Tente une génération avec recherche web (stats fraîches + URLs réelles).
// Bascule sur le squelette « mémoire » si la recherche web échoue/indisponible.
export async function generateSkeletonLive(nom: string) {
  let research = "";
  try {
    research = await researchFacts(nom);
  } catch {
    research = "";
  }
  if (!research.trim())
    return { skeleton: await generateSkeleton(nom), web: false };

  const skeleton = await completeJSON(SkeletonSchema, {
    model: MODEL_MID,
    system: `Tu structures un dossier Socrates à partir d'une recherche web de faits RÉCENTS et SOURCÉS. Réponds en français. Pour les faits, REPRENDS exactement les valeurs, sources et URLs de la recherche — n'invente aucune URL, ne change aucun chiffre.`,
    prompt: `Thème : ${nom}.

Recherche web (faits récents, format FAIT/VALEUR/SOURCE/URL) :
${research}

Produis le dossier : reprends ces 10 faits (valeur + source + URL exacts de la recherche), puis ajoute 5 écoles de pensée distinctes, 6 arguments (les plus forts toutes positions confondues), 6 contre-arguments, 5 questions ouvertes difficiles.`,
  });
  if (!skeleton) return { skeleton: await generateSkeleton(nom), web: false };
  return { skeleton, web: true };
}

// ---------- Cours linéaire (la fondation pour apprendre) ----------

// Étape 1 : le PLAN seul. Enjeu + titres de sections + un cadrage d'une ligne par
// section. Court et fiable (jamais tronqué). Le NOMBRE de sections suit l'épaisseur
// RÉELLE du sujet, sans plafond étroit (Haïti ≈ 6-8, énergie/libéralisme ≈ 25-40).
const CourseOutlineSchema = z.object({
  enjeu: z
    .string()
    .describe(
      "La tension centrale du sujet en 3-4 phrases : pourquoi c'est politiquement disputé, ce qui se joue vraiment, la vraie question de fond"
    ),
  sections: z
    .array(
      z.object({
        titre: z.string().describe("Titre clair et précis de la section"),
        brief: z
          .string()
          .describe(
            "1 à 2 phrases : ce que CETTE section doit couvrir précisément, et quel(s) cas pays / exemple incarné y traiter (avec leurs conséquences)."
          ),
      })
    )
    .describe(
      "Le plan COMPLET, autant de sections que l'épaisseur RÉELLE du sujet l'exige, SANS plafond : un sujet mince (Haïti, un pays précis) tient en 6 à 8 sections ; un sujet vaste et dense (énergie, libéralisme, fiscalité, Chine) en demande 25 à 40. L'écart DOIT refléter la vraie densité, pas une fourchette étroite. Le plan couvre tout : histoire, chiffres, écoles de pensée et leur logique, cas pays + conséquences, controverses, comparaisons internationales, angles morts, enjeux 2027."
    ),
});

// Exécute fn sur chaque item avec au plus `limit` en parallèle (on évite de lancer
// 40 process `claude -p` d'un coup). Garde l'ordre des résultats.
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );
  return out;
}

// Filet anti tiret cadratin/long dans la prose d'une section (le prompt l'interdit
// déjà, ceci ne fait que garantir).
const cleanCorps = (s: string) => (s ?? "").replace(/[—–]/g, ", ").trim();

// Le COURS DE FOND, généré en DEUX TEMPS pour atteindre une vraie profondeur de
// livre de référence (un seul appel plafonne et tronque) :
//   1) le PLAN (Opus + web) : enjeu + titres + cadrage, calibré à l'épaisseur du sujet ;
//   2) l'EXPANSION : chaque section rédigée dans SON propre appel (Sonnet + web), en
//      parallèle limité, donc sans compétition de tokens ni troncature.
// C'est la FONDATION : il nourrit la leçon ET les flashcards.
export async function generateCourse(
  nom: string,
  onProgress?: (done: number, total: number) => void
) {
  const outline = await completeJSON(CourseOutlineSchema, {
    model: MODEL,
    web: true,
    system: `Tu dresses le PLAN d'un COURS DE FOND de référence sur un sujet, pour que l'utilisateur le COMPRENNE en profondeur et le maîtrise (pas seulement pour le débattre). Tu ne rédiges PAS encore le contenu : tu produis l'ossature complète.
PRINCIPE CLÉ : un sujet ne se réduit pas à sa dimension politique. Éclaire-le sous TOUS les angles que SA nature propre exige, et seulement ceux-là. Tu JUGES quelles dimensions ce sujet précis appelle vraiment, sans plaquer un template uniforme.
EXIGENCES :
- Un « enjeu » : la tension centrale du sujet en 3-4 phrases.
- Une liste ORDONNÉE de sections couvrant les dimensions PERTINENTES POUR CE SUJET, dans une progression logique. Selon le sujet, cela mêle :
  • la PROFONDEUR HISTORIQUE (comment on en est arrivé là sur le temps long) : presque tout sujet en a une ;
  • le CADRE SCIENTIFIQUE / TECHNIQUE, les MÉCANISMES réels du sujet, MAIS SEULEMENT quand le sujet en a un. Les drogues (la neurobiologie de l'addiction), le climat (la physique de l'effet de serre), l'énergie, la monnaie, les biotechnologies l'exigent et seraient creux sans ; un pays comme Haïti ou un sujet purement institutionnel n'en a pas, alors n'en invente AUCUN (pas de section scientifique hors-sol) ;
  • les réalités chiffrées, les écoles de pensée / camps et leur logique interne, les CAS PRATIQUES par pays (quelle politique, quelle variante, quelles conséquences mesurées), les grandes controverses, les comparaisons internationales, les angles morts ;
  • et en ABOUTISSEMENT, les enjeux politiques actuels et à venir.
- Exemples de calibrage : un cours sur les DROGUES doit prendre le temps de la science (addiction, pharmacologie) ET de l'histoire (opium, prohibition, guerre à la drogue) avant la politique de légalisation ; un cours sur HAÏTI est avant tout historique, géopolitique et social, sans volet scientifique.
- RESTE AU NIVEAU MACRO DU SUJET : un sous-thème qui mérite son propre sujet à part entière (le libéralisme, le socialisme, le conservatisme dans « Philosophie politique » ; un pays précis dans « Géopolitique ») se traite en VUE D'ENSEMBLE, sa place et sa logique en UNE section au plus, PAS en détail exhaustif, il aura son propre cours. Tu couvres le sujet, pas ses enfants.
- NOMBRE DE SECTIONS = épaisseur RÉELLE du sujet : un sujet mince (Haïti) tient en 6-8 sections ; un sujet vaste et dense (énergie, fiscalité, Chine) en exige 25-40. N'aplatis JAMAIS un gros sujet sur une fourchette étroite, MAIS plafonne à ~40 : si le sujet en demanderait davantage, c'est qu'il est trop large pour un seul cours, reste alors plus macro (ses sous-thèmes deviendront des sujets séparés).
- Chaque section a un titre précis + un « brief » d'une ligne disant ce qu'elle doit couvrir (et, si pertinent, quel cas pays y traiter).
- Pas de redondance entre sections. Sers-toi du web pour cadrer les vrais sous-thèmes actuels.
Réponds en français, sans tiret cadratin/long (— ni –).`,
    prompt: `Sujet : ${nom}.

Dresse le plan complet du cours de référence, calibré à l'épaisseur de CE sujet précis (ne le sous-dimensionne pas s'il est dense). Forme EXACTE : {"enjeu":"…","sections":[{"titre":"…","brief":"…"}]}.`,
  });
  if (!outline?.sections?.length) return null;

  const planTitres = outline.sections
    .map((s, k) => `${k + 1}. ${s.titre}`)
    .join("\n");

  // Progression : on signale le total, puis chaque section au fil de l'eau.
  const total = outline.sections.length;
  let done = 0;
  onProgress?.(0, total);

  // 2) Chaque section, dans son propre appel : tout le budget pour elle seule.
  const corpsList = await mapLimit(outline.sections, 5, async (s, i) => {
    const txt = await completeText({
      model: MODEL_MID,
      web: true,
      system: `Tu rédiges UNE seule section d'un cours de fond de référence sur un sujet. Elle doit être DENSE, rigoureuse et complète, écrite depuis une connaissance profonde, pour que l'utilisateur maîtrise vraiment le point.
RÈGLES :
- Rédige SEULEMENT le corps de la section demandée, en prose (plusieurs paragraphes séparés par une ligne vide). N'écris PAS le titre, pas de puces, pas de markdown, pas de numéro.
- VA AU FOND DU REGISTRE DE LA SECTION : si elle est scientifique, sois réellement rigoureux sur les mécanismes (le comment ça marche, pas une vague allusion) ; si elle est historique, sois daté et incarné ; si elle est économique, chiffre ; si elle est politique, rends la logique de chaque camp. Prends le temps qu'il faut.
- Substantielle : 250 à 450 mots (plus si le point est dense). Va au fond, zéro remplissage.
- CAS PRATIQUES quand c'est pertinent : quel pays a appliqué quoi (ou quelle variante d'un modèle) et avec quelles CONSÉQUENCES concrètes et mesurées (succès, échecs, effets pervers).
- RIGUEUR : utilise la recherche web pour les chiffres À JOUR et exacts, attribués à leur source dans le texte (ex. « 57,1 Md€ selon le PLF 2026 »). N'invente JAMAIS un chiffre, une étude ou une source ; dans le doute, donne un ordre de grandeur en le signalant.
- Définis chaque sigle/terme technique à sa première apparition. Équilibré et honnête entre les camps.
- Reste DANS le périmètre de cette section, ne déborde pas sur les autres (le plan complet t'est donné pour ça).
- JAMAIS de tiret cadratin/long (— ni –) : virgule, deux points ou parenthèses. Réponds en français.`,
      prompt: `Sujet du cours : ${nom}.
Enjeu global : ${outline.enjeu}

Plan complet (pour situer, NE déborde pas sur les autres sections) :
${planTitres}

Rédige le corps de la section ${i + 1} : « ${s.titre} ».
À couvrir précisément : ${s.brief}`,
    }).catch(() => "");
    done += 1;
    onProgress?.(done, total);
    return txt;
  });

  const sections = outline.sections
    .map((s, i) => ({ titre: s.titre, corps: cleanCorps(corpsList[i]) }))
    .filter((s) => s.corps.length > 80);
  if (!sections.length) return null;
  return { enjeu: outline.enjeu, sections };
}

// Le tuteur de la leçon guidée : il enseigne UNE étape, de façon interactive.
export function buildLessonSystem(
  nom: string,
  cours: { enjeu: string; sections: { titre: string; corps: string }[] },
  stepIndex: number
): string {
  const i = Math.max(0, Math.min(stepIndex, cours.sections.length - 1));
  const plan = cours.sections
    .map((s, k) => `${k + 1}. ${s.titre}${k === i ? "   ← étape en cours" : ""}`)
    .join("\n");
  const step = cours.sections[i];
  const dernier = i === cours.sections.length - 1;
  return `Tu es le TUTEUR de Socrates. Tu enseignes un sujet à un utilisateur français qui veut le maîtriser à fond, sous tous les angles que le sujet exige (historique, scientifique, économique, politique selon les cas) — de façon INTERACTIVE, surtout pas en récitant un cours.

Sujet : ${nom}.
L'enjeu global : ${cours.enjeu}

Plan de la leçon :
${plan}

ÉTAPE EN COURS — « ${step.titre} ». Ta matière de référence (ne la recopie pas, sers-t'en pour enseigner) :
${step.corps}

COMMENT TU ENSEIGNES — SOUS-POINT PAR SOUS-POINT, AVEC VALIDATION (impératif) :
- Découpe cette étape en SOUS-POINTS (les idées essentielles, tirées de ta matière de référence). Tu les traites UN PAR UN, dans l'ordre, sans en oublier.
- Pour chaque sous-point : explique-le en 2 à 4 phrases MAX (JAMAIS un pavé, concret, un chiffre sourcé si ça éclaire), PUIS pose UNE question de compréhension précise dessus et ATTENDS sa réponse.
- VOCABULAIRE : définis tout sigle ou terme technique la PREMIÈRE fois que tu l'emploies, en quelques mots, sans alourdir (ex. « l'OTAN — l'alliance militaire transatlantique — … », « la BITD, c'est-à-dire l'industrie de défense française, … »). N'assume aucun prérequis : il découvre le sujet.
- ÉVALUE sa réponse honnêtement, et c'est TA RÉPONSE QUI DÉCIDE :
  • Réponse juste → valide en UNE phrase, PUIS, dans la MÊME réplique, ENCHAÎNE aussitôt sur le sous-point suivant : présente-le en 2-4 phrases et pose SA question. Ne t'arrête JAMAIS juste après avoir validé — tu repars immédiatement. (Marqueur [POINT_OK] en toute dernière ligne, après ta nouvelle question.)
  • Réponse fausse ou floue → NE mets PAS [POINT_OK]. Ré-explique AUTREMENT (analogie, exemple plus simple) et repose une question. Ne donne pas la réponse tout de suite.
- JAMAIS BLOQUÉ : après 2 tentatives ratées, explique-le-lui clairement, puis enchaîne sur le sous-point suivant avec sa question (marqueur [POINT_VU] en dernière ligne).
- RÈGLE D'OR : ta réplique FINIT TOUJOURS par une question claire (ou, en toute fin d'étape, par une consigne d'action). JAMAIS sur une remarque passive (« garde ça en tête », « on y reviendra ») — sinon l'utilisateur ne sait plus quoi faire. Il doit toujours savoir exactement quoi répondre ensuite.
- S'IL S'ÉCARTE : réponds court, puis ramène-le au sous-point en cours avec une question. Ne te perds jamais.
- FIN D'ÉTAPE : quand tous les sous-points sont traités, dis-lui clairement que l'étape est bouclée et de cliquer « Étape suivante », et termine par UNE SEULE balise sur la dernière ligne — [ÉTAPE_OK] si l'essentiel a été MAÎTRISÉ (bonnes réponses), ou [ÉTAPE_VU] s'il reste fragile${dernier ? ". C'est la DERNIÈRE étape : félicite-le et propose de passer aux débats" : ""}.
- Les balises ([POINT_OK]/[POINT_VU]/[ÉTAPE_OK]/[ÉTAPE_VU]) sont des marqueurs techniques, seuls sur la toute dernière ligne, jamais commentés, et ne remplacent jamais la question.
- Français, TEXTE BRUT (aucun markdown, pas d'astérisques, pas de listes à puces). JAMAIS de tiret cadratin/long (— ni –) : utilise une virgule, deux points ou des parenthèses. Honnêteté factuelle absolue : jamais un chiffre inventé.`;
}

// ---------- Extraction depuis un transcript YouTube ----------

const ExtractionSchema = z.object({
  titre_devine: z.string().describe("Titre ou sujet probable de la vidéo"),
  resume: z.string().describe("Résumé de la vidéo en 2-3 phrases"),
  items: z.array(
    z.object({
      dossier: z
        .string()
        .describe(
          "Slug d'un dossier existant fourni dans la liste, ou « nouveau:Nom Du Dossier » si aucun ne convient"
        ),
      categorie: z
        .string()
        .nullable()
        .describe(
          "Si dossier est « nouveau:… » : la macro-catégorie (une existante de la liste de préférence), sinon null"
        ),
      type: z.enum(["fait", "argument", "contre", "question"]),
      texte: z.string(),
      valeur: z
        .string()
        .nullable()
        .describe(
          "Le chiffre ABRÉGÉ et court (≤ 14 car., abréviations M/Md/€/$, pas de « millions » ni « environ », pas de parenthèse) si c'est un fait chiffré, sinon null. Le contexte va dans le texte."
        ),
    })
  ),
});

export async function extractFromContent(
  contenu: string,
  sourceLabel: string,
  dossiers: Dossier[]
) {
  const liste = dossiers
    .map((d) => `- ${d.slug} (${d.nom}, catégorie ${d.categorie})`)
    .join("\n");
  return completeJSON(ExtractionSchema, {
    model: MODEL_MID,
    system: `Tu alimentes Socrates, la base de connaissances politique personnelle de l'utilisateur. On te donne un contenu brut (transcript de vidéo YouTube, conversation, notes en vrac, article…). Tu en extrais ce qui mérite d'entrer dans la base : faits chiffrés, arguments substantiels, contre-arguments, questions ouvertes. Ignore le remplissage, les anecdotes, la promo. Chaque item est autoporteur (compréhensible sans le contenu d'origine), reformulé proprement en français, et rangé dans le dossier le plus pertinent de la liste fournie. N'invente RIEN qui ne soit pas dans le contenu ; si un chiffre y est approximatif, garde-le approximatif.`,
    prompt: `Dossiers existants :\n${liste}\n\nSource : ${sourceLabel}\n\nContenu :\n${contenu}`,
  });
}

// ---------- Débats ----------

export type DebateMode =
  | "cours"
  | "destroy"
  | "steelman"
  | "devil"
  | "socialiste"
  | "conservateur"
  | "libertarien"
  | "marxiste"
  | "technocrate"
  | "federaliste";

export const DEBATE_MODES: {
  value: DebateMode;
  label: string;
  desc: string;
}[] = [
  {
    value: "cours",
    label: "Comprendre (cours)",
    desc: "Tu pars de zéro : le professeur t'enseigne le sujet par la discussion jusqu'à un premier avis.",
  },
  {
    value: "destroy",
    label: "Attaque ma position",
    desc: "L'adversaire démonte ta position : prémisses, chiffres, conséquences.",
  },
  {
    value: "steelman",
    label: "Le camp adverse, en mieux",
    desc: "Il défend la position opposée à la tienne, dans sa meilleure version possible.",
  },
  {
    value: "devil",
    label: "Avocat du diable",
    desc: "Il traque tes hypothèses cachées et tes angles morts, question après question.",
  },
  {
    value: "socialiste",
    label: "Face à un socialiste",
    desc: "Égalité réelle, État, services publics : il débat avec ses valeurs.",
  },
  {
    value: "conservateur",
    label: "Face à un conservateur",
    desc: "Nation, continuité, autorité : il débat avec ses valeurs.",
  },
  {
    value: "libertarien",
    label: "Face à un libertarien",
    desc: "Liberté individuelle, marchés, État minimal.",
  },
  {
    value: "marxiste",
    label: "Face à un marxiste",
    desc: "Capital, classes, rapports de production : lecture matérialiste.",
  },
  {
    value: "technocrate",
    label: "Face à un technocrate",
    desc: "Données, comparaisons internationales, faisabilité budgétaire.",
  },
  {
    value: "federaliste",
    label: "Face à un fédéraliste européen",
    desc: "L'échelle pertinente est l'Europe : souveraineté partagée.",
  },
];

const MODE_PROMPTS: Record<DebateMode, string> = {
  cours:
    "Ton rôle : professeur d'exception (agrégé, pédagogue, neutre). L'utilisateur arrive sur ce sujet avec peu de connaissances et aucun avis. Construis un vrai cours À TRAVERS le dialogue : pars de ce qu'il sait déjà, explique les faits clés et leurs ordres de grandeur, présente les grandes écoles de pensée et leurs MEILLEURS arguments de façon équilibrée, fais émerger les vraies tensions. Avance pas à pas — une idée à la fois — et vérifie sa compréhension par une question à la fin de chaque réplique. Reste neutre entre les camps : tu enseignes, tu n'imposes pas. Quand il a assez d'éléments, invite-le à formuler son propre premier avis.",
  destroy:
    "Ton rôle : démolir la position de l'utilisateur. Attaque ses prémisses, ses chiffres, ses implications cachées, ses conséquences logiques. Sois précis et factuel, jamais gratuit. Si un de ses points tient vraiment, concède-le en une phrase puis attaque ailleurs.",
  steelman:
    "Ton rôle : construire le steelman — la meilleure version possible de la position ADVERSE à celle de l'utilisateur. Présente-la comme le ferait son défenseur le plus intelligent et le plus honnête, avec ses meilleurs faits et sa cohérence interne. Pas de paille.",
  devil:
    "Ton rôle : avocat du diable. Cherche les hypothèses cachées et les angles morts du raisonnement de l'utilisateur. Pose des questions qui dérangent, révèle les présupposés non examinés, teste la cohérence avec ses autres positions probables.",
  socialiste:
    "Tu incarnes un intellectuel socialiste français brillant (filiation Jaurès–Rocard, à toi de doser). Tu débats avec tes valeurs : égalité réelle, rôle de l'État, services publics, redistribution. Arguments du meilleur niveau, chiffres à l'appui.",
  conservateur:
    "Tu incarnes un intellectuel conservateur français brillant (filiation Burke, Finkielkraut côté culturel). Tu débats avec tes valeurs : continuité historique, nation, famille, autorité, prudence face au changement. Arguments du meilleur niveau.",
  libertarien:
    "Tu incarnes un intellectuel libertarien brillant (Hayek, Friedman, Nozick). Tu débats avec tes valeurs : liberté individuelle, marchés, État minimal, responsabilité. Arguments du meilleur niveau, chiffres à l'appui.",
  marxiste:
    "Tu incarnes un intellectuel marxiste brillant (lecture matérialiste : rapports de production, capital, classes). Tu athe userses chaque sujet par ce prisme avec rigueur, sans caricature militante. Arguments du meilleur niveau.",
  technocrate:
    "Tu incarnes un haut fonctionnaire technocrate brillant (X-ENA, Cour des comptes). Tu débats par les données, les comparaisons internationales, la faisabilité budgétaire et administrative. Les grands principes t'intéressent moins que ce qui marche.",
  federaliste:
    "Tu incarnes un fédéraliste européen brillant (filiation Monnet, Habermas). Tu débats avec ta conviction : l'échelle pertinente est européenne — souveraineté partagée, marché commun, défense commune. Arguments du meilleur niveau.",
};

export function buildDebateSystem(
  mode: DebateMode,
  dossier: Dossier,
  entries: Entry[]
): string {
  const faits = entries
    .filter((e) => e.type === "fait")
    .map(
      (e) =>
        `- ${e.texte}${e.valeur ? ` : ${e.valeur}` : ""}${e.source ? ` (${e.source})` : ""}`
    )
    .join("\n");
  const intro =
    mode === "cours"
      ? "Tu es le professeur de Socrates, l'outil de travail intellectuel d'un utilisateur français qui veut sur-maîtriser chaque sujet pour ne plus jamais perdre un débat. Là, il découvre le sujet : ton travail est de le lui ENSEIGNER."
      : "Tu es le partenaire de débat de Socrates, l'outil d'entraînement intellectuel d'un utilisateur français qui se prépare à un très haut niveau de débat politique. Être mis en difficulté est pour lui une victoire : ton travail est de l'y mettre.";
  return `${intro}

${MODE_PROMPTS[mode]}

Sujet : ${dossier.nom}.
Position actuelle de l'utilisateur (confiance ${dossier.confiance} %) : « ${dossier.position || "(pas encore formulée — commence par la lui faire formuler)"} »

Faits déjà dans son dossier :
${faits || "(aucun)"}

Règles : réponds en français ; reste dans ton rôle tout le débat ; des répliques courtes et denses (150-250 mots max) qui finissent souvent par une question ou une attaque précise ; ne flatte jamais ; ne conclus pas le débat toi-même ; texte brut uniquement, aucune mise en forme markdown (pas d'astérisques, pas de titres, pas de listes à puces) ; JAMAIS de tiret cadratin/long (— ni –), utilise virgule, deux points ou parenthèses.

HONNÊTETÉ FACTUELLE (non négociable) : ne fabrique JAMAIS un chiffre ou une étude pour gagner. N'avance un chiffre précis que si tu en es sûr ; sinon, donne un ordre de grandeur en le signalant (« de l'ordre de… », « de mémoire, à vérifier »). Un débatteur qui invente une statistique est disqualifié — toi y compris.`;
}

export function streamDebate(
  system: string,
  messages: { role: "user" | "assistant"; content: string }[],
  model: string = MODEL
) {
  return streamText({ model, system, messages, maxTokens: 2048 });
}

// Tiering coût : Opus seulement pour les épreuves exigeantes (jugement fin) ;
// Sonnet pour le tuteur et les débats « personas », largement suffisant et ~5x
// moins cher sur le forfait.
const HARD_DEBATE = new Set<DebateMode>(["destroy", "devil"]);
export function modelForMode(mode: DebateMode): string {
  return HARD_DEBATE.has(mode) ? MODEL : MODEL_MID;
}
export const LESSON_MODEL = MODEL_MID;

// Approfondir un fait = explication courte → Sonnet suffit (et c'est fréquent).
export function streamExplore(
  system: string,
  messages: { role: "user" | "assistant"; content: string }[]
) {
  return streamText({ model: MODEL_MID, system, messages, maxTokens: 1024 });
}

// ---------- Approfondir un fait précis (conversation) ----------

export function buildExploreSystem(dossier: Dossier, entry: Entry): string {
  const TYPE_LABEL: Record<Entry["type"], string> = {
    fait: "fait",
    ecole: "école de pensée",
    argument: "argument",
    contre: "contre-argument",
    question: "question ouverte",
  };
  const ligne = `[${TYPE_LABEL[entry.type]}] ${entry.texte}${
    entry.valeur ? ` (${entry.valeur})` : ""
  }${entry.source ? ` — source : ${entry.source}` : ""}`;
  return `Tu es l'assistant d'étude de Socrates. L'utilisateur veut APPROFONDIR un point précis de son dossier « ${dossier.nom} », pas débattre. L'élément à creuser :

${ligne}

CONTRAINTE DE LONGUEUR ABSOLUE : réponds COURT. Premier message = 4-5 phrases max (l'origine du chiffre/de l'idée, ce qu'il faut en retenir, LA nuance clé). Ensuite tu réponds aux questions de l'utilisateur une par une, toujours en quelques phrases. JAMAIS de pavé. Si le sujet est riche, termine par une seule question « tu veux que je creuse plutôt X ou Y ? » et laisse-le choisir. Français, texte brut sans markdown (pas d'astérisques ni de listes à puces). Ne mens pas : si tu n'es pas sûr d'un chiffre, dis-le.`;
}

// ---------- Débrief de débat ----------

const DebriefSchema = z.object({
  resume: z.string().describe("Résumé du débat en 2 phrases"),
  difficultes: z
    .array(z.string())
    .describe("Ce qui a mis l'utilisateur en difficulté"),
  faits_manquants: z
    .array(z.string())
    .describe("Les faits/chiffres qui lui manquaient"),
  a_approfondir: z.array(z.string()).describe("Les idées à creuser"),
});

export async function generateDebrief(
  dossierNom: string,
  mode: string,
  transcript: { role: string; content: string }[]
) {
  const conv = transcript
    .map((m) => `${m.role === "user" ? "LUI" : "ADVERSAIRE"} : ${m.content}`)
    .join("\n\n");
  return completeJSON(DebriefSchema, {
    model: MODEL_MID,
    maxTokens: 8000,
    system: `Tu rédiges le débrief d'un débat d'entraînement pour le journal de débats de l'utilisateur (sujet : ${dossierNom}, mode : ${mode}). Sois honnête et exigeant : le but est qu'il progresse, pas qu'il se rassure. « LUI » = l'utilisateur. Réponds en français.`,
    prompt: conv,
  });
}

// ---------- Auto-classement d'un nouveau dossier ----------

const CategorieSchema = z.object({
  categorie: z
    .string()
    .describe(
      "La macro-catégorie : une de la liste fournie de préférence, sinon une nouvelle courte et naturelle"
    ),
});

export async function categorizeDossier(nom: string, categories: string[]) {
  const r = await completeJSON(CategorieSchema, {
    model: MODEL_FAST,
    maxTokens: 1000,
    system:
      "Tu ranges un nouveau dossier politique dans une macro-catégorie. Réponds en français.",
    prompt: `Catégories existantes : ${categories.join(", ")}.\nDossier à ranger : « ${nom} ».`,
  });
  return r?.categorie ?? "Divers";
}

// ---------- Examen du week-end ----------

const ExamSubjectSchema = z.object({
  sujet: z
    .string()
    .describe(
      "L'intitulé du sujet de dissertation, une seule phrase, format concours"
    ),
  cadrage: z
    .string()
    .describe("2-3 phrases : ce qu'un bon traitement du sujet doit affronter"),
});

export async function generateExamSubject(nomDossier: string) {
  return completeJSON(ExamSubjectSchema, {
    model: MODEL_MID,
    maxTokens: 4000,
    system: `Tu es le jury d'entraînement de Socrates. Tu donnes UN sujet de dissertation de niveau concours (ENA/Sciences Po/agrégation) sur le thème demandé : exigeant, avec une vraie tension interne, traitable en 1 heure au papier-stylo sans documentation. Pas de sujet bateau. Réponds en français.`,
    prompt: `Thème : ${nomDossier}. Donne le sujet.`,
  });
}

const CorrectionSchema = z.object({
  note_sur_20: z.number(),
  appreciation: z
    .string()
    .describe("Appréciation générale en 2-3 phrases, ton de jury"),
  points_forts: z.array(z.string()),
  faiblesses_fond: z
    .array(z.string())
    .describe("Lacunes de fond : faits manquants, raisonnements faibles, angles morts"),
  faiblesses_forme: z
    .array(z.string())
    .describe("Défauts de rédaction : structure, style, clarté"),
  conseils: z.array(z.string()).describe("Conseils concrets pour la prochaine fois"),
});

export async function correctExam(
  dossierNom: string,
  sujet: string,
  copie: string
) {
  return completeJSON(CorrectionSchema, {
    model: MODEL,
    system: `Tu es un jury de concours exigeant (niveau ENA/agrégation). Tu corriges une copie rédigée en 1 heure, à la main, sans documentation, sur le thème « ${dossierNom} ». Note sévèrement mais justement sur 20 ; le but est la progression réelle de l'utilisateur (il se prépare à un très haut niveau), pas de le ménager. Évalue le fond (maîtrise, faits, nuances, contre-arguments) ET la forme (structure, clarté, style). Réponds en français, tutoie.`,
    prompt: `Sujet : ${sujet}\n\nCopie :\n${copie}`,
  });
}

const PhotoCorrectionSchema = CorrectionSchema.extend({
  transcription: z
    .string()
    .describe("La copie manuscrite transcrite fidèlement, texte intégral"),
});

export type ExamImage = {
  media_type: "image/jpeg" | "image/png" | "image/webp";
  data: string; // base64
};

// Vision : reste sur l'API (le headless ne porte pas l'image inline) — débordement assumé.
export async function correctExamFromPhotos(
  dossierNom: string,
  sujet: string,
  images: ExamImage[]
) {
  const content: Anthropic.ContentBlockParam[] = [
    ...images.map(
      (img): Anthropic.ImageBlockParam => ({
        type: "image",
        source: { type: "base64", media_type: img.media_type, data: img.data },
      })
    ),
    {
      type: "text",
      text: `Sujet : ${sujet}\n\nVoici les photos de la copie manuscrite, dans l'ordre des pages. Transcris-la intégralement puis corrige-la.`,
    },
  ];
  const response = await apiClient().messages.parse({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: `Tu es un jury de concours exigeant (niveau ENA/agrégation). On te donne les photos d'une copie MANUSCRITE rédigée en 1 heure, sans documentation, sur le thème « ${dossierNom} ». D'abord transcris la copie fidèlement (sans corriger ni embellir : ce qui est écrit, exactement). Puis note sévèrement mais justement sur 20 — fond (maîtrise, faits, nuances, contre-arguments) ET forme (structure, clarté, style, et puisque c'est manuscrit : signale aussi si l'écriture rend des passages illisibles). Le but est la progression réelle de l'utilisateur. Réponds en français, tutoie.`,
    messages: [{ role: "user", content }],
    output_config: { format: zodOutputFormat(PhotoCorrectionSchema) },
  });
  return response.parsed_output;
}

// ---------- Synthèse de la position (depuis l'engagement de l'utilisateur) ----------

const PositionSchema = z.object({
  position: z
    .string()
    .describe(
      "Une première formulation de la position de l'utilisateur, 3-6 phrases, à la première personne, nuancée"
    ),
  confiance: z
    .number()
    .describe("Niveau de confiance suggéré (0-100) vu la solidité actuelle"),
});

export async function synthesizePosition(
  dossier: Dossier,
  entries: Entry[],
  debriefs: string[]
) {
  const faits = entries
    .filter((e) => e.type === "fait")
    .slice(0, 12)
    .map((e) => `- ${e.texte}${e.valeur ? ` : ${e.valeur}` : ""}`)
    .join("\n");
  const debatsTxt = debriefs.length
    ? debriefs.join("\n\n")
    : "(aucun débat encore)";
  return completeJSON(PositionSchema, {
    model: MODEL,
    maxTokens: 4000,
    system: `Tu aides l'utilisateur de Socrates à formuler SA position sur un sujet — pas la tienne. Tu pars de SES matériaux : ses notes personnelles, et la façon dont ses débats ont tourné (ce qui l'a convaincu, ce qui l'a mis en difficulté). Tu en tires une PREMIÈRE formulation honnête de ce vers quoi IL penche, nuancée et défendable, à la première personne (« Je pense que… »). Tu n'imposes pas un avis générique : si ses notes penchent d'un côté, suis-le. C'est un brouillon qu'il corrigera. Réponds en français.`,
    prompt: `Sujet : ${dossier.nom}.

Mes notes personnelles :
${dossier.notes.trim() || "(vides)"}

Débriefs de mes débats (ce qui m'a mis en difficulté, ce qui m'a manqué) :
${debatsTxt}

Quelques faits du dossier :
${faits || "(aucun)"}

Propose une première formulation de MA position et un niveau de confiance.`,
  });
}

// ---------- Reading Space : synthèse finale + flashcards ----------

const BookSynthSchema = z.object({
  key_ideas: z
    .array(z.string())
    .describe("5 à 10 idées maîtresses du livre, une phrase chacune"),
  concepts: z
    .array(z.string())
    .describe("Concepts/définitions importants, format « Concept : définition courte »"),
  arguments: z
    .array(z.string())
    .describe("Arguments réutilisables en débat / dissertation / discussion"),
  counterarguments: z
    .array(z.string())
    .describe("Critiques possibles du livre, ses angles faibles"),
  pensee_avant: z
    .string()
    .describe("« Avant ce livre, je pensais… » (déduit des notes de l'utilisateur)"),
  pensee_apres: z.string().describe("« Après ce livre, je pense… »"),
  conf_avant: z.number().describe("Confiance estimée avant (0-100)"),
  conf_apres: z.number().describe("Confiance estimée après (0-100)"),
  dossiers_suggeres: z
    .array(z.string())
    .describe("Noms des dossiers Socrates que ce livre devrait nourrir/mettre à jour"),
});

export async function synthesizeBook(
  titre: string,
  auteur: string,
  notes: { type: string; contenu: string }[],
  dossiersExistants: string[]
) {
  const notesTxt = notes.length
    ? notes.map((n) => `(${n.type}) ${n.contenu}`).join("\n")
    : "(aucune note prise)";
  return completeJSON(BookSynthSchema, {
    model: MODEL,
    maxTokens: 8000,
    system: `Tu fais la synthèse finale d'un livre pour le Reading Space de Socrates. But : que le livre devienne une PARTIE de la pensée de l'utilisateur, pas un truc oublié. Tu t'appuies d'abord sur SES notes de lecture (ce qu'IL a retenu), complétées par ta connaissance du livre. Sois dense, concret, réutilisable — pas un résumé scolaire. Pour « avant/après », déduis honnêtement l'évolution depuis ses notes. Réponds en français.`,
    prompt: `Livre : « ${titre} » — ${auteur}.

Mes notes de lecture :
${notesTxt}

Dossiers Socrates existants : ${dossiersExistants.join(", ") || "(aucun)"}.

Produis la synthèse finale (idées clés, concepts, arguments réutilisables, contre-arguments, évolution avant/après + confiance, dossiers à mettre à jour).`,
  });
}

const BookCardsSchema = z.object({
  cards: z
    .array(z.object({ question: z.string(), reponse: z.string() }))
    .describe("5 à 15 flashcards à FORTE valeur — jamais plus de 15"),
});

export async function generateBookCards(
  titre: string,
  auteur: string,
  synthese: string
) {
  return completeJSON(BookCardsSchema, {
    model: MODEL_MID,
    maxTokens: 6000,
    system: `Tu génères des flashcards de révision à partir de la synthèse d'un livre. RÈGLE : seulement les cartes à FORTE valeur (concepts, arguments clés, faits historiques, distinctions, citations utiles, idées prêtes pour un débat). 5 à 15 MAXIMUM, jamais plus — la sélection prime sur la quantité. Question courte au recto, réponse dense mais concise au verso. Réponds en français.`,
    prompt: `Livre : « ${titre} » — ${auteur}.

Synthèse :
${synthese}

Génère les flashcards (5-15, les plus précieuses).`,
  });
}

const DossierCardsSchema = z.object({
  cards: z
    .array(
      z.object({
        type: z
          .enum(["qa", "cloze"])
          .describe("'qa' = question/réponse, 'cloze' = phrase à trou"),
        question: z
          .string()
          .describe(
            "Pour 'qa' : la question. Pour 'cloze' : une phrase avec UN trou marqué ___ (un seul trou)."
          ),
        reponse: z
          .string()
          .describe(
            "Pour 'qa' : réponse brève (1-2 phrases). Pour 'cloze' : ce qui va dans le ___ (un chiffre, un nom, un terme)."
          ),
      })
    )
    .describe(
      "Autant de flashcards courtes (mélange 'qa' et 'cloze') que la matière fournie le justifie : couverture exhaustive, proportionnelle à la quantité de cours donnée."
    ),
});

// Flashcards d'un sujet (Anki maison) : COURTES, mélange Q/R et cloze, couvrant
// tout l'essentiel du cours. C'est le cœur de la rétention : qualité avant tout.
export async function generateCards(
  nom: string,
  cours: { enjeu: string; sections: { titre: string; corps: string }[] }
) {
  const plan = cours.sections
    .map((s, k) => `${k + 1}. ${s.titre}\n${s.corps}`)
    .join("\n\n");
  return completeJSON(DossierCardsSchema, {
    model: MODEL_MID,
    maxTokens: 8000,
    system: `Tu fabriques un jeu de flashcards de révision (type Anki) à partir d'un cours (qui peut être une SEULE section ou le cours entier), pour ANCRER DURABLEMENT l'essentiel. C'est le cœur de la rétention : la qualité prime.
RÈGLES STRICTES :
- Cartes COURTES, règle DURE : recto ≤ 20 mots (une question précise, une seule), verso ≤ 15 mots (l'idéal : 3 à 10 mots, le fait nu). Une carte longue ne sera jamais retenue : va à l'os, coupe tout le contexte récitable.
- Mélange deux formats : des 'qa' (question précise au recto, réponse de 1 phrase au verso) ET des 'cloze' (une phrase d'énoncé avec UN seul trou marqué ___, la réponse étant le chiffre / nom / terme manquant). Les cloze sont excellents pour mémoriser chiffres, dates, noms, définitions.
- PRIORITÉ AUX IDÉES (crucial) : la MAJORITÉ des cartes porte sur les concepts, les mécanismes (pourquoi X produit Y), les distinctions conceptuelles, la logique interne de chaque camp, les causes et conséquences des cas pays. Les chiffres n'entrent que s'ils sont STRUCTURANTS (l'ordre de grandeur qui change le débat), jamais des stats décoratives. Une carte de concept reste atomique : « Pourquoi le prix de l'électricité suit-il celui du gaz ? » → « prix marginal : la dernière centrale appelée fixe le prix » tient en une ligne.
- COUVERTURE : chaque essentiel RÉEL de la matière (concept, mécanisme, distinction, argument décisif, cas pays + conséquence, chiffre structurant) donne UNE carte. Ne laisse passer aucun essentiel.
- PEU DE CARTES, l'essentiel en soi : typiquement 3 à 6 par section substantielle, jamais plus de 8. Le test pour chaque carte : « dans 5 ans, doit-il savoir ça PAR CŒUR pour maîtriser le sujet ? » Si non, pas de carte. JAMAIS deux cartes pour la même idée, JAMAIS de remplissage (2 essentiels = 2 cartes). Une seule idée par carte. Français, sans tiret cadratin/long (— ni –).`,
    prompt: `Sujet : ${nom}.

Cours :
${plan}

Produis les flashcards. Forme EXACTE : {"cards":[{"type":"qa","question":"…","reponse":"…"},{"type":"cloze","question":"… ___ …","reponse":"…"}]}.`,
  });
}

// L'utilisateur a SURLIGNÉ un passage du tuteur (signal fort : il veut le retenir).
// On en fait UNE carte sur mesure, atomique.
export async function generateCardFromClip(
  nom: string,
  contexte: string,
  extrait: string
) {
  return completeJSON(DossierCardsSchema, {
    model: MODEL_MID,
    maxTokens: 600,
    system: `Tu transformes UN extrait surligné par l'utilisateur en UNE SEULE flashcard (type Anki). S'il a surligné ce passage, c'est qu'il veut le retenir : fais la meilleure carte atomique possible sur l'idée centrale de l'extrait (concept, mécanisme, distinction ; un chiffre seulement s'il est le cœur du passage).
RÈGLES : recto ≤ 20 mots (une question précise) OU un cloze avec UN seul trou ___ ; verso ≤ 15 mots (le fait nu). Choisis 'qa' ou 'cloze' selon ce qui ancre le mieux. EXACTEMENT 1 carte. Français, sans tiret cadratin/long (— ni –).`,
    prompt: `Sujet : ${nom}. Contexte (étape de la leçon) : ${contexte}.

Extrait surligné :
« ${extrait} »

Produis exactement UNE carte. Forme EXACTE : {"cards":[{"type":"qa","question":"…","reponse":"…"}]}.`,
  });
}

export async function generateCardsFromResource(
  nom: string,
  titre: string,
  contenu: string
) {
  return completeJSON(DossierCardsSchema, {
    model: MODEL_MID,
    maxTokens: 4000,
    system: `Tu fabriques des flashcards (type Anki) à partir d'une RESSOURCE (tweet, conversation, article, notes…) pour en retenir l'essentiel. Cartes COURTES, mélange 'qa' et 'cloze' (phrase avec UN seul trou ___). Ne retiens QUE ce qui mérite d'être mémorisé (chiffres, idées, arguments forts), 4 à 12 cartes. Français, sans tiret cadratin/long (— ni –).`,
    prompt: `Sujet : ${nom}. Ressource : « ${titre} ».

${contenu}

Forme EXACTE : {"cards":[{"type":"qa","question":"…","reponse":"…"},{"type":"cloze","question":"… ___ …","reponse":"…"}]}.`,
  });
}

// ---------- Détection « tu zoomes trop » (sous-thème à sortir) ----------

const SplitsSchema = z.object({
  splits: z
    .array(
      z.object({
        nom: z.string().describe("Nom précis du sujet à créer"),
        categorie: z
          .string()
          .nullable()
          .describe("Macro-catégorie suggérée, ou null"),
        raison: z
          .string()
          .describe("UNE phrase : pourquoi ce sous-thème mérite son propre sujet"),
        ressourceIds: z
          .array(z.number())
          .describe("IDs des ressources à déplacer vers ce nouveau sujet"),
        entryIds: z
          .array(z.number())
          .describe("IDs des éléments (faits/arguments…) à déplacer"),
      })
    )
    .describe(
      "0 à 3 sous-thèmes assez denses pour devenir leur propre sujet. VIDE si rien ne se détache vraiment."
    ),
});

// Repère si un sous-thème a tellement grossi dans un dossier qu'il mérite son
// propre sujet (« l'utilisateur zoome trop dessus »). Très conservateur.
export async function detectSplits(nom: string, material: string) {
  return completeJSON(SplitsSchema, {
    model: MODEL_MID,
    maxTokens: 3000,
    system: `Tu athe userses un dossier politique et tu détectes si un SOUS-THÈME y a tellement grossi qu'il mérite de devenir son propre sujet (l'utilisateur "zoome trop" dessus).
RÈGLES STRICTES :
- Ne propose un split QUE si un sous-thème est vraiment DENSE et DISTINCT : au moins 3 éléments (ressources et/ou faits) qui vont ensemble et débordent clairement du sujet parent.
- Sois TRÈS CONSERVATEUR : dans le doute, ne propose RIEN (splits vide). Mieux vaut rater un split que sur-découper le travail de l'utilisateur.
- Pour chaque split : un nom précis, une raison en une phrase, et les IDs EXACTS des ressources/éléments à déplacer (uniquement ceux qui relèvent vraiment du sous-thème).
- Français, sans tiret cadratin/long (— ni –).`,
    prompt: `Sujet parent : « ${nom} ».

Matière du dossier (avec IDs) :
${material}

Détecte 0 à 3 sous-thèmes assez denses pour devenir leur propre sujet. Forme EXACTE : {"splits":[{"nom":"…","categorie":null,"raison":"…","ressourceIds":[1,2],"entryIds":[5]}]}. Si rien ne se détache vraiment : {"splits":[]}.`,
  });
}

// ---------- Ingestion d'une ressource (tweet, conv GPT, article…) ----------

// Schéma TOLÉRANT : seuls dossier + titre sont requis. Les autres champs ont
// un repli si le modèle les omet (une conv GPT longue produit parfois un JSON
// incomplet) : on ne casse plus l'ingestion pour si peu.
const ResourceSchema = z.object({
  dossier: z
    .string()
    .describe(
      "slug d'un dossier existant fourni dans la liste, ou « nouveau:Nom Du Sujet » si aucun ne convient"
    ),
  categorie: z
    .string()
    .nullable()
    .optional()
    .describe("si « nouveau:… » : la macro-catégorie, sinon null"),
  type: z
    .string()
    .optional()
    .default("note")
    .describe(
      "nature de la ressource en un mot minuscule : tweet, thread, conversation, article, note, video…"
    ),
  titre: z.string().describe("titre court et parlant de la ressource"),
  source: z
    .string()
    .nullable()
    .optional()
    .describe("auteur/compte (@x), média, ou « ChatGPT » ; null si inconnu"),
  resume: z
    .string()
    .optional()
    .default("")
    .describe("résumé honnête en 2-3 phrases de ce que dit la ressource"),
  points: z
    .array(z.string())
    .optional()
    .default([])
    .describe("3 à 8 idées/faits clés à retenir, courts"),
});

// Range une ressource dans le bon sujet, la résume et en tire les points clés.
// On NE la dissout PAS en faits bruts : elle reste une ressource consultable.
export async function ingestResource(
  contenu: string,
  sourceLabel: string,
  dossiers: Dossier[]
) {
  const liste = dossiers
    .map((d) => `- ${d.slug} (${d.nom}, catégorie ${d.categorie})`)
    .join("\n");
  return completeJSON(ResourceSchema, {
    model: MODEL_MID,
    maxTokens: 3000,
    system: `Tu ranges une RESSOURCE (un tweet, une conversation avec ChatGPT, un article, des notes en vrac…) dans la base de travail politique de l'utilisateur. Tu identifies : le SUJET le plus pertinent, le type, un titre court et parlant, la source, un résumé bref et honnête, et 3 à 8 points clés à retenir. Tu CONDENSES, tu ne réécris pas tout. N'invente rien.
RÈGLE DE SUJET (importante) : préfère un sujet PRÉCIS. Si la ressource porte sur un thème pointu qui mérite son propre dossier (ex. Wokisme, Semi-conducteurs, Venezuela, Haïti, Intelligence artificielle, Nucléaire…), crée-le via « nouveau:Nom » plutôt que de le noyer dans un dossier trop large (Géopolitique, Société, Économie…). Ne réutilise un dossier existant que s'il colle vraiment. Un sujet sur lequel on accumule de la matière mérite d'exister seul.
Français, sans tiret cadratin/long (— ni –).`,
    prompt: `Dossiers existants :\n${liste}\n\nSource : ${sourceLabel}\n\nRessource :\n${contenu.slice(0, 16000)}\n\nForme EXACTE : {"dossier":"…","categorie":null,"type":"…","titre":"…","source":null,"resume":"…","points":["…"]}`,
  });
}

// ---------- Identification + sommaire d'un livre ----------

const BookIdSchema = z.object({
  titre: z.string().describe("Titre EXACT et canonique du livre"),
  auteur: z.string().describe("Nom complet de l'auteur"),
  annee: z
    .string()
    .nullable()
    .describe("Année de publication originale si connue, sinon null"),
});

// Résout une saisie utilisateur (souvent approximative : titre incomplet, faute,
// auteur partiel) vers le livre EXACT. Fiabilise la couverture ET les chapitres.
export async function identifyBook(titre: string, auteur: string) {
  return completeJSON(BookIdSchema, {
    model: MODEL_MID,
    maxTokens: 600,
    system: `Tu identifies un livre à partir d'une saisie parfois approximative (titre incomplet, faute d'orthographe, auteur partiel). Renvoie le TITRE exact et canonique, le NOM COMPLET de l'auteur, et l'année de publication originale. Si plusieurs livres collent, choisis le plus probable et connu. Si tu ne reconnais vraiment pas le livre, renvoie la saisie corrigée des fautes évidentes. Réponds en français, sans tiret cadratin (— ni –).`,
    prompt: `Saisie de l'utilisateur : titre « ${titre} », auteur « ${auteur} ».
Donne le livre exact. Forme EXACTE : {"titre":"…","auteur":"…","annee":"…"|null}`,
  });
}

const ChaptersSchema = z.object({
  chapitres: z
    .array(
      z.object({
        num: z
          .string()
          .describe("Repère du chapitre : « 1 », « 2 »… ou « Intro », « Conclusion »"),
        titre: z.string().describe("Titre du chapitre"),
      })
    )
    .describe("Sommaire COMPLET et ordonné, jusqu'à 50 entrées"),
});

export async function fetchBookChapters(
  titre: string,
  auteur: string,
  annee?: string | null
) {
  const ref = `« ${titre} » de ${auteur}${annee ? ` (${annee})` : ""}`;
  return completeJSON(ChaptersSchema, {
    model: MODEL_MID,
    maxTokens: 5000,
    web: true,
    system: `Tu établis le SOMMAIRE COMPLET (table des matières réelle) d'un livre pour pré-séquencer une lecture. C'est crucial : l'utilisateur compte dessus, il te faut TOUS les chapitres.
MÉTHODE (sois tenace) :
- Cherche activement la vraie table des matières sur le web. Les meilleures sources pour les livres français : la fiche de l'ÉDITEUR, Google Books (aperçu « Table des matières »), Babelio, Decitre, Fnac, Cairn (pour les essais universitaires), Wikipédia. Croise plusieurs sources.
- Si la recherche web ne donne pas le sommaire complet, COMPLÈTE avec ta propre connaissance du livre (beaucoup d'essais connus, ex. les livres de Pascal Boniface, ont une structure que tu connais). Le but est un sommaire COMPLET et fidèle, jamais tronqué à « introduction / conclusion ».
- Reproduis TOUS les chapitres dans l'ORDRE réel, titres exacts, vraie numérotation. N'invente JAMAIS un titre : si tu hésites sur un titre précis, donne le thème réel de ce chapitre plutôt qu'un titre inventé.
- Seulement si le livre n'a objectivement aucun découpage (court essai d'un seul tenant), propose un séquençage par sections réelles.
- Jusqu'à 50 entrées. Réponds en français, sans tiret cadratin (— ni –).`,
    prompt: `Livre : ${ref}. Retrouve sa table des matières RÉELLE et COMPLÈTE, et reproduis-la fidèlement (numéro + titre, dans l'ordre, sans en omettre).
Forme EXACTE : {"chapitres":[{"num":"1","titre":"…"},{"num":"2","titre":"…"}]}`,
  });
}

// Trappe de secours infaillible : l'utilisateur colle une page (éditeur, Fnac,
// Decitre, le sommaire copié…) et on en extrait les chapitres EXACTS.
export async function extractChaptersFromText(
  titre: string,
  auteur: string,
  texte: string
) {
  return completeJSON(ChaptersSchema, {
    model: MODEL_MID,
    maxTokens: 5000,
    system: `Tu extrais la TABLE DES MATIÈRES d'un livre à partir d'un texte fourni par l'utilisateur (page d'un éditeur, fiche Fnac/Decitre/Babelio, ou sommaire copié-collé).
- Repère TOUS les chapitres / fiches / parties listés, dans l'ordre, avec leurs titres réels. N'omets rien.
- Si le texte ne liste pas tout mais DÉCRIT la structure (ex. « 50 fiches sur le Proche-Orient, l'Ukraine, les BRICS, l'IA… »), reconstitue fidèlement les entrées à partir des thèmes réellement mentionnés, sans inventer au-delà de ce qui est dit.
- Ignore tout le bruit de la page (prix, avis, navigation, pub). Ne garde que le sommaire.
- Numérotation simple. Réponds en français, sans tiret cadratin (— ni –).`,
    prompt: `Livre : « ${titre} » de ${auteur}.

Texte source (extrais-en le sommaire) :
${texte.slice(0, 16000)}

Forme EXACTE : {"chapitres":[{"num":"1","titre":"…"},{"num":"2","titre":"…"}]}`,
  });
}

// ---------- Recommandations de lecture ----------

const BooksSchema = z.object({
  livres: z
    .array(
      z.object({
        titre: z.string(),
        auteur: z.string(),
        pages: z
          .number()
          .nullable()
          .describe("Nombre de pages approximatif, ou null si inconnu"),
        tradition: z
          .string()
          .nullable()
          .describe(
            "Tradition intellectuelle / bord (libéral, conservateur, marxiste, classique…) ou null"
          ),
        pourquoi: z
          .string()
          .describe(
            "2-3 phrases : pourquoi CE livre pour CET utilisateur, ce qu'il va y gagner, son rapport insight/page"
          ),
      })
    )
    .describe("UN ou DEUX livres maximum, jamais plus"),
});

export async function recommendBooks(dossier: Dossier, entries: Entry[]) {
  const questions = entries
    .filter((e) => e.type === "question")
    .map((e) => `- ${e.texte}`)
    .join("\n");
  return completeJSON(BooksSchema, {
    model: MODEL_MID,
    maxTokens: 6000,
    system: `Tu es le mentor de lecture de Socrates : exigeant intellectuellement mais PRAGMATIQUE sur le temps. Tu recommandes des livres à un futur candidat à la présidentielle française qui veut sur-maîtriser ce sujet.

Règles absolues :
- UN ou DEUX livres MAXIMUM. Jamais une liste. Le but est la sélection, pas l'abondance.
- Priorité : qualité, valeur à long terme, profondeur, accessibilité, efficacité du temps.
- Privilégie les livres au rapport insight/page élevé : concis, peu de remplissage, retour intellectuel maximal. Un brillant 200 pages vaut mieux qu'un médiocre 1000 pages. Ne recommande un gros livre QUE s'il est exceptionnel et irremplaçable.
- Cherche parmi : classiques, livres très bien notés, livres souvent recommandés par les experts, et fais varier les traditions idéologiques.
- Un livre doit se connecter au dossier, améliorer sa vision du monde, rester utile des années. Pas de livre qu'on collectionne sans lire.
- N'invente jamais un livre : titres et auteurs réels uniquement.

Réponds en français.`,
    prompt: `Dossier : ${dossier.nom}.
Position actuelle (confiance ${dossier.confiance} %) : « ${dossier.position || "(aucune)"} »
Questions ouvertes :
${questions || "(aucune)"}

Recommande 1 ou 2 livres.`,
  });
}

// ---------- Contradictions inter-dossiers ----------

const ContradictionsSchema = z.object({
  contradictions: z.array(
    z.object({
      texte: z
        .string()
        .describe(
          "La tension, formulée comme une question directe : « Tu es pour X, mais aussi pour Y. Comment tiens-tu les deux ? »"
        ),
      dossiers: z.array(z.string()).describe("Les slugs des dossiers impliqués"),
    })
  ),
});

export async function detectContradictions(dossiers: Dossier[]) {
  const positions = dossiers
    .filter((d) => d.position.trim())
    .map((d) => `[${d.slug}] ${d.nom} (confiance ${d.confiance} %) : ${d.position}`)
    .join("\n");
  if (!positions) return { contradictions: [] };
  return completeJSON(ContradictionsSchema, {
    model: MODEL,
    maxTokens: 8000,
    system: `Tu es le détecteur de contradictions de Socrates. On te donne l'ensemble des positions de l'utilisateur, dossier par dossier. Tu cherches les tensions RÉELLES entre elles : incompatibilités logiques, conséquences de l'une qui contredisent l'autre, arbitrages non assumés (ex. immigration ↔ logement ↔ démographie ↔ école). Ne signale que les tensions substantielles — zéro pinaillage. S'il n'y en a pas, renvoie une liste vide. Réponds en français, tutoie l'utilisateur.`,
    prompt: positions,
  });
}
