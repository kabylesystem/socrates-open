import Database from "better-sqlite3";
import path from "path";
import fs from "node:fs";

const DB_PATH = path.join(process.cwd(), "data", "socrates.db");

// Connexion unique par process (évite les rechargements multiples du module
// natif en dev/HMR, source de « Module did not self-register »).
const g = globalThis as unknown as {
  __socratesDb?: Database.Database;
  __socratesBackup?: boolean;
};
const db = g.__socratesDb ?? new Database(DB_PATH);
if (!g.__socratesDb) {
  g.__socratesDb = db;
  db.pragma("journal_mode = WAL");
  // Fusionne le WAL dans le .db principal régulièrement : sinon les données
  // récentes vivent dans socrates.db-wal et un .db copié seul serait périmé.
  db.pragma("wal_autocheckpoint = 200");
}

db.exec(`
  CREATE TABLE IF NOT EXISTS dossiers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    nom TEXT NOT NULL,
    position TEXT NOT NULL DEFAULT '',
    confiance INTEGER NOT NULL DEFAULT 50,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dossier_id INTEGER NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('fait','ecole','argument','contre','question')),
    texte TEXT NOT NULL,
    valeur TEXT,
    source TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS debats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dossier_id INTEGER NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
    mode TEXT NOT NULL,
    transcript TEXT NOT NULL DEFAULT '[]',
    debrief TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS ingests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    titre TEXT,
    resume TEXT,
    nb_entries INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS examens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dossier_id INTEGER NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
    sujet TEXT NOT NULL,
    copie TEXT,
    correction TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS revisions (
    entry_id INTEGER PRIMARY KEY REFERENCES entries(id) ON DELETE CASCADE,
    due_at TEXT NOT NULL DEFAULT (datetime('now')),
    interval_days REAL NOT NULL DEFAULT 1,
    streak INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS position_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dossier_id INTEGER NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
    position TEXT NOT NULL,
    confiance INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS contradictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    texte TEXT NOT NULL,
    dossiers TEXT NOT NULL DEFAULT '[]',
    statut TEXT NOT NULL DEFAULT 'ouverte' CHECK (statut IN ('ouverte','resolue')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    video_id TEXT,
    titre TEXT,
    resume TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS video_dossiers (
    video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    dossier_id INTEGER NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
    nb_entries INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (video_id, dossier_id)
  );
  CREATE TABLE IF NOT EXISTS livres (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dossier_id INTEGER NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
    titre TEXT NOT NULL,
    auteur TEXT NOT NULL,
    pages INTEGER,
    tradition TEXT,
    pourquoi TEXT NOT NULL,
    cover_url TEXT,
    buy_url TEXT,
    lu INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  -- Reading Space : un livre = sa page de lecture (lecture active, pas une reco)
  CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titre TEXT NOT NULL,
    auteur TEXT NOT NULL,
    statut TEXT NOT NULL DEFAULT 'reading' CHECK (statut IN ('not_started','reading','finished','abandoned')),
    theme TEXT,
    difficulte TEXT,
    impact TEXT,
    cover_url TEXT,
    buy_url TEXT,
    pourquoi TEXT,
    objectif TEXT,
    synthese TEXT,
    pensee_avant TEXT,
    pensee_apres TEXT,
    conf_avant INTEGER,
    conf_apres INTEGER,
    date_started TEXT,
    date_finished TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS book_dossiers (
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    dossier_id INTEGER NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
    PRIMARY KEY (book_id, dossier_id)
  );
  CREATE TABLE IF NOT EXISTS book_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'idee' CHECK (type IN ('chapitre','citation','idee','question','desaccord','argument')),
    chapitre TEXT,
    contenu TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS book_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    reponse TEXT NOT NULL,
    due_at TEXT NOT NULL DEFAULT (datetime('now')),
    interval_days REAL NOT NULL DEFAULT 1,
    streak INTEGER NOT NULL DEFAULT 0
  );
`);

const livreCols = db.prepare("PRAGMA table_info(livres)").all() as {
  name: string;
}[];
if (!livreCols.some((c) => c.name === "cover_url"))
  db.exec("ALTER TABLE livres ADD COLUMN cover_url TEXT");
if (!livreCols.some((c) => c.name === "buy_url"))
  db.exec("ALTER TABLE livres ADD COLUMN buy_url TEXT");

// Migration : colonne categorie (macro-catégorie du dossier)
const cols = db.prepare("PRAGMA table_info(dossiers)").all() as {
  name: string;
}[];
if (!cols.some((c) => c.name === "categorie")) {
  db.exec(
    "ALTER TABLE dossiers ADD COLUMN categorie TEXT NOT NULL DEFAULT 'Divers'"
  );
}
if (!cols.some((c) => c.name === "notes")) {
  db.exec("ALTER TABLE dossiers ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
}

const entryCols = db.prepare("PRAGMA table_info(entries)").all() as {
  name: string;
}[];
if (!entryCols.some((c) => c.name === "source_url"))
  db.exec("ALTER TABLE entries ADD COLUMN source_url TEXT");

if (!cols.some((c) => c.name === "gen_status"))
  db.exec(
    "ALTER TABLE dossiers ADD COLUMN gen_status TEXT NOT NULL DEFAULT 'idle'"
  );
// Migration : le cours linéaire généré (enjeu + sections), en JSON.
if (!cols.some((c) => c.name === "cours"))
  db.exec("ALTER TABLE dossiers ADD COLUMN cours TEXT");
// Horodatage du début de génération : permet de débloquer un « busy » resté
// coincé (process mort en pleine génération).
if (!cols.some((c) => c.name === "gen_started_at"))
  db.exec("ALTER TABLE dossiers ADD COLUMN gen_started_at TEXT");
// Suggestion « tu zoomes trop sur X » : sous-thèmes à sortir en sujet à part (JSON).
if (!cols.some((c) => c.name === "split_suggestion"))
  db.exec("ALTER TABLE dossiers ADD COLUMN split_suggestion TEXT");
// Dernière erreur de génération (manque de crédits, réseau…) pour la transparence.
if (!cols.some((c) => c.name === "gen_error"))
  db.exec("ALTER TABLE dossiers ADD COLUMN gen_error TEXT");
// Migration : l'état de la leçon en cours (étape, messages, couverture), en JSON.
if (!cols.some((c) => c.name === "lecon"))
  db.exec("ALTER TABLE dossiers ADD COLUMN lecon TEXT");
// Migration : progression de la génération du cours (sections rédigées / total),
// pour afficher « section 22/36 » au lieu d'attendre dans le noir.
if (!cols.some((c) => c.name === "gen_done"))
  db.exec("ALTER TABLE dossiers ADD COLUMN gen_done INTEGER NOT NULL DEFAULT 0");
if (!cols.some((c) => c.name === "gen_total"))
  db.exec("ALTER TABLE dossiers ADD COLUMN gen_total INTEGER NOT NULL DEFAULT 0");

// Flashcards d'un sujet (Anki maison, répétition espacée). Générées depuis le
// cours et la leçon. type : 'qa' (question/réponse) ou 'cloze' (texte à trou).
db.exec(`CREATE TABLE IF NOT EXISTS dossier_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dossier_id INTEGER NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  reponse TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'qa',
  due_at TEXT NOT NULL DEFAULT (datetime('now')),
  interval_days REAL NOT NULL DEFAULT 1,
  streak INTEGER NOT NULL DEFAULT 0
)`);
const dcCols = db.prepare("PRAGMA table_info(dossier_cards)").all() as {
  name: string;
}[];
if (!dcCols.some((c) => c.name === "type"))
  db.exec("ALTER TABLE dossier_cards ADD COLUMN type TEXT NOT NULL DEFAULT 'qa'");
// SM-2 (Anki) : facteur de facilité par carte, ajusté à chaque réponse.
if (!dcCols.some((c) => c.name === "ease"))
  db.exec("ALTER TABLE dossier_cards ADD COLUMN ease REAL NOT NULL DEFAULT 2.5");

// Coût réel de chaque appel IA (depuis total_cost_usd) : jauge de conso forfait.
db.exec(`CREATE TABLE IF NOT EXISTS usage_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  cost_usd REAL NOT NULL DEFAULT 0
)`);

// Ressources ingérées (tweet, conv GPT, article, vidéo, note) rangées par sujet.
// On garde le contenu brut + un résumé + les points clés ; pas dissous en faits.
db.exec(`CREATE TABLE IF NOT EXISTS ressources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dossier_id INTEGER NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'note',
  titre TEXT NOT NULL,
  source TEXT,
  contenu TEXT NOT NULL,
  resume TEXT,
  points TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);

// Migration : sommaire (table des matières) du livre, en JSON.
const bookCols = db.prepare("PRAGMA table_info(books)").all() as {
  name: string;
}[];
if (!bookCols.some((c) => c.name === "chapitres"))
  db.exec("ALTER TABLE books ADD COLUMN chapitres TEXT");

const debatCols = db.prepare("PRAGMA table_info(debats)").all() as {
  name: string;
}[];
if (!debatCols.some((c) => c.name === "statut"))
  db.exec(
    "ALTER TABLE debats ADD COLUMN statut TEXT NOT NULL DEFAULT 'termine'"
  );
if (!debatCols.some((c) => c.name === "updated_at"))
  db.exec("ALTER TABLE debats ADD COLUMN updated_at TEXT");

// Macro-catégories → micro-dossiers
const DOSSIERS_INITIAUX: Record<string, string[]> = {
  "Idées & fondations": ["Philosophie politique", "Idéologies", "Histoire", "Religions du monde", "Capitalisme", "Démocratie", "Sciences", "Psychologie"],
  "Économie": ["Monnaie", "Inflation", "Croissance", "Dette", "Fiscalité", "Finance", "Mondialisation", "Inégalités", "Protection sociale", "Travail", "Logement", "Industrie", "Agriculture", "Énergie"],
  "Écologie": ["Climat", "Biodiversité", "Ressources", "Pollution"],
  "Société": ["Immigration", "École", "Santé", "Religion", "Identité", "Sécurité", "Retraites", "Laïcité", "Wokisme", "Démographie", "Médias", "Genre", "Famille", "Territoires", "Drogues", "Culture"],
  "International": ["Europe", "États-Unis", "Chine", "Russie", "Géopolitique", "Défense", "Moyen-Orient", "Inde", "Afrique du Nord", "Afrique subsaharienne", "Amérique latine", "Venezuela", "Haïti", "Kabylie", "Institutions internationales"],
  "Régalien & institutions": ["Droit", "Justice", "Institutions", "Nationalisme", "Corruption"],
  "Technologie": ["IA", "Numérique", "Semi-conducteurs", "Réseaux sociaux", "Espace", "Biotechnologies"],
};

export function slugify(nom: string): string {
  return nom
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const seed = db.prepare(
  "INSERT OR IGNORE INTO dossiers (slug, nom, categorie) VALUES (?, ?, ?)"
);
for (const [categorie, noms] of Object.entries(DOSSIERS_INITIAUX))
  for (const nom of noms) seed.run(slugify(nom), nom, categorie);
// Les dossiers seedés avant l'arrivée des catégories récupèrent la leur
const recat = db.prepare(
  "UPDATE dossiers SET categorie = ? WHERE slug = ? AND categorie = 'Divers'"
);
for (const [categorie, noms] of Object.entries(DOSSIERS_INITIAUX))
  for (const nom of noms) recat.run(categorie, slugify(nom));

// Sauvegarde automatique CONTINUE : dès qu'il y a un changement, un snapshot
// cohérent (VACUUM INTO) atterrit dans data/backups/ (au plus une fois / 30 s).
// Zéro action de l'utilisateur. Rotation : on garde les 40 dernières.
if (!g.__socratesBackup) {
  g.__socratesBackup = true;
  const backupDir = path.join(process.cwd(), "data", "backups");
  try {
    fs.mkdirSync(backupDir, { recursive: true });
  } catch {}
  let lastBackup = 0;
  const tick = () => {
    try {
      const wal = DB_PATH + "-wal";
      const m = Math.max(
        fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH).mtimeMs : 0,
        fs.existsSync(wal) ? fs.statSync(wal).mtimeMs : 0
      );
      if (m <= lastBackup) return;
      // Fusionne le WAL dans le .db principal avant de sauvegarder.
      try {
        db.pragma("wal_checkpoint(TRUNCATE)");
      } catch {}
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const dest = path.join(backupDir, `socrates-${ts}.db`);
      db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
      lastBackup = Date.now();
      const files = fs
        .readdirSync(backupDir)
        .filter((f) => f.startsWith("socrates-") && f.endsWith(".db"))
        .sort();
      for (const old of files.slice(0, Math.max(0, files.length - 40)))
        fs.unlinkSync(path.join(backupDir, old));
    } catch {
      // une sauvegarde ratée ne doit jamais casser l'app
    }
  };
  const timer = setInterval(tick, 30_000);
  (timer as unknown as { unref?: () => void }).unref?.();
}

export type Dossier = {
  id: number;
  slug: string;
  nom: string;
  categorie: string;
  position: string;
  notes: string;
  confiance: number;
  gen_status: string;
  gen_started_at: string | null;
  cours: string | null;
  lecon: string | null;
  split_suggestion: string | null;
  gen_error: string | null;
  gen_done: number;
  gen_total: number;
  updated_at: string;
};

export type Entry = {
  id: number;
  dossier_id: number;
  type: "fait" | "ecole" | "argument" | "contre" | "question";
  texte: string;
  valeur: string | null;
  source: string | null;
  source_url: string | null;
  created_at: string;
};

export type Debat = {
  id: number;
  dossier_id: number;
  mode: string;
  transcript: string;
  debrief: string | null;
  created_at: string;
};

export type Contradiction = {
  id: number;
  texte: string;
  dossiers: string;
  statut: "ouverte" | "resolue";
  created_at: string;
};

export function listDossiers(): Dossier[] {
  return db
    .prepare("SELECT * FROM dossiers ORDER BY categorie, nom")
    .all() as Dossier[];
}

export function listCategories(): string[] {
  return (
    db
      .prepare(
        "SELECT DISTINCT categorie FROM dossiers ORDER BY categorie"
      )
      .all() as { categorie: string }[]
  ).map((r) => r.categorie);
}

export function groupByCategorie(dossiers: Dossier[]): [string, Dossier[]][] {
  const map = new Map<string, Dossier[]>();
  for (const d of dossiers) {
    if (!map.has(d.categorie)) map.set(d.categorie, []);
    map.get(d.categorie)!.push(d);
  }
  return [...map.entries()];
}

export function getDossier(slug: string): Dossier | undefined {
  return db.prepare("SELECT * FROM dossiers WHERE slug = ?").get(slug) as
    | Dossier
    | undefined;
}

export function getDossierById(id: number): Dossier | undefined {
  return db.prepare("SELECT * FROM dossiers WHERE id = ?").get(id) as
    | Dossier
    | undefined;
}

export function maitriseByCategorie(): Record<string, number> {
  const byD = maitriseByDossier();
  const rows = db
    .prepare("SELECT id, categorie FROM dossiers")
    .all() as { id: number; categorie: string }[];
  const acc: Record<string, { sum: number; n: number }> = {};
  for (const r of rows) {
    acc[r.categorie] ??= { sum: 0, n: 0 };
    acc[r.categorie].sum += byD[r.id] ?? 0;
    acc[r.categorie].n += 1;
  }
  return Object.fromEntries(
    Object.entries(acc).map(([k, v]) => [k, Math.round(v.sum / v.n)])
  );
}

export function listEntries(dossierId: number): Entry[] {
  return db
    .prepare(
      "SELECT * FROM entries WHERE dossier_id = ? ORDER BY type, created_at"
    )
    .all(dossierId) as Entry[];
}

export function countEntries(dossierId: number): number {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM entries WHERE dossier_id = ?")
    .get(dossierId) as { n: number };
  return row.n;
}

export function addEntry(
  dossierId: number,
  type: Entry["type"],
  texte: string,
  valeur?: string | null,
  source?: string | null,
  sourceUrl?: string | null
): void {
  db.prepare(
    "INSERT INTO entries (dossier_id, type, texte, valeur, source, source_url) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(dossierId, type, texte, valeur ?? null, source ?? null, sourceUrl ?? null);
}

export function deleteEntry(id: number): void {
  db.prepare("DELETE FROM entries WHERE id = ?").run(id);
}

export function deleteEntriesOfType(
  dossierId: number,
  type: Entry["type"]
): void {
  db.prepare("DELETE FROM entries WHERE dossier_id = ? AND type = ?").run(
    dossierId,
    type
  );
}

export function countUnverifiedFacts(dossierId: number): number {
  return (
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM entries WHERE dossier_id = ? AND type='fait' AND source IS NOT NULL AND source_url IS NULL"
      )
      .get(dossierId) as { n: number }
  ).n;
}

export function updatePosition(
  dossierId: number,
  position: string,
  confiance: number
): void {
  const current = db
    .prepare("SELECT position, confiance FROM dossiers WHERE id = ?")
    .get(dossierId) as { position: string; confiance: number } | undefined;
  db.prepare(
    "UPDATE dossiers SET position = ?, confiance = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(position, confiance, dossierId);
  // Mémoire longitudinale : on archive chaque changement réel
  if (
    position.trim() &&
    (current?.position !== position || current?.confiance !== confiance)
  ) {
    db.prepare(
      "INSERT INTO position_history (dossier_id, position, confiance) VALUES (?, ?, ?)"
    ).run(dossierId, position, confiance);
  }
}

export function listPositionHistory(dossierId: number) {
  return db
    .prepare(
      "SELECT * FROM position_history WHERE dossier_id = ? ORDER BY created_at DESC"
    )
    .all(dossierId) as {
    id: number;
    position: string;
    confiance: number;
    created_at: string;
  }[];
}

export function updateNotes(dossierId: number, notes: string): void {
  db.prepare("UPDATE dossiers SET notes = ? WHERE id = ?").run(
    notes,
    dossierId
  );
}

export function saveLesson(dossierId: number, lecon: string): void {
  db.prepare("UPDATE dossiers SET lecon = ? WHERE id = ?").run(lecon, dossierId);
}

// Clippe un extrait dans les notes, rangé sous le chapitre (étape de la leçon) :
// regroupe sous un titre « ## chapitre » pour organiser au fil de l'eau.
export function clipToNotes(
  dossierId: number,
  chapitre: string,
  texte: string
): void {
  const cur =
    (
      db.prepare("SELECT notes FROM dossiers WHERE id = ?").get(dossierId) as
        | { notes: string }
        | undefined
    )?.notes ?? "";
  const heading = `## ${chapitre}`;
  const clip = `- ${texte.trim().replace(/\s+/g, " ")}`;
  const lines = cur.length ? cur.split("\n") : [];
  const hi = lines.findIndex((l) => l.trim() === heading);
  if (hi === -1) {
    const prefix = cur.trim() ? cur.trim() + "\n\n" : "";
    updateNotes(dossierId, prefix + heading + "\n" + clip);
    return;
  }
  let end = lines.length;
  for (let i = hi + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) {
      end = i;
      break;
    }
  }
  let insertAt = end;
  while (insertAt > hi + 1 && lines[insertAt - 1].trim() === "") insertAt--;
  lines.splice(insertAt, 0, clip);
  updateNotes(dossierId, lines.join("\n"));
}

export function appendNotes(dossierId: number, ajout: string): void {
  const cur = (
    db.prepare("SELECT notes FROM dossiers WHERE id = ?").get(dossierId) as
      | { notes: string }
      | undefined
  )?.notes;
  const next = (cur?.trim() ? cur.trim() + "\n\n" : "") + ajout.trim();
  db.prepare("UPDATE dossiers SET notes = ? WHERE id = ?").run(next, dossierId);
}

export function setGenStatus(dossierId: number, status: "idle" | "busy"): void {
  db.prepare("UPDATE dossiers SET gen_status = ? WHERE id = ?").run(
    status,
    dossierId
  );
}

// Verrou atomique : acquiert « busy » seulement si idle (ou si un ancien busy
// est resté coincé > 30 min). Renvoie true si on a bien pris le verrou.
// Évite deux générations concurrentes ET débloque un busy fantôme. La fenêtre est
// à 30 min car un gros cours (plan + dizaines de sections + web) dépasse 10 min
// légitimement : trop court provoquerait un faux reset et une double génération.
export function acquireGenLock(dossierId: number): boolean {
  const r = db
    .prepare(
      `UPDATE dossiers SET gen_status = 'busy', gen_started_at = datetime('now'), gen_error = NULL, gen_done = 0, gen_total = 0
       WHERE id = ?
         AND (gen_status = 'idle'
              OR gen_started_at IS NULL
              OR gen_started_at < datetime('now', '-30 minutes'))`
    )
    .run(dossierId);
  return r.changes === 1;
}

// Progression de la génération : combien de sections rédigées sur le total.
export function setGenProgress(
  dossierId: number,
  done: number,
  total: number
): void {
  db.prepare(
    "UPDATE dossiers SET gen_done = ?, gen_total = ? WHERE id = ?"
  ).run(done, total, dossierId);
}

// Mémorise (ou efface) la dernière erreur de génération, pour la transparence.
export function setGenError(dossierId: number, error: string | null): void {
  db.prepare("UPDATE dossiers SET gen_error = ? WHERE id = ?").run(
    error,
    dossierId
  );
}

export function saveCours(dossierId: number, coursJson: string): void {
  db.prepare("UPDATE dossiers SET cours = ? WHERE id = ?").run(
    coursJson,
    dossierId
  );
}

export function createDossier(nom: string, categorie = "Divers"): Dossier {
  const slug = slugify(nom);
  db.prepare(
    "INSERT OR IGNORE INTO dossiers (slug, nom, categorie) VALUES (?, ?, ?)"
  ).run(slug, nom, categorie);
  return getDossier(slug)!;
}

export function listDebats(dossierId: number): Debat[] {
  return db
    .prepare(
      "SELECT * FROM debats WHERE dossier_id = ? AND statut = 'termine' ORDER BY created_at DESC"
    )
    .all(dossierId) as Debat[];
}

export function saveDebat(
  dossierId: number,
  mode: string,
  transcript: string,
  debrief: string
): void {
  // Finalise la conversation en cours pour ce mode si elle existe, sinon insère
  const ongoing = db
    .prepare(
      "SELECT id FROM debats WHERE dossier_id = ? AND mode = ? AND statut = 'en_cours' ORDER BY id DESC LIMIT 1"
    )
    .get(dossierId, mode) as { id: number } | undefined;
  if (ongoing) {
    db.prepare(
      "UPDATE debats SET transcript = ?, debrief = ?, statut = 'termine', updated_at = datetime('now') WHERE id = ?"
    ).run(transcript, debrief, ongoing.id);
  } else {
    db.prepare(
      "INSERT INTO debats (dossier_id, mode, transcript, debrief, statut, updated_at) VALUES (?, ?, ?, ?, 'termine', datetime('now'))"
    ).run(dossierId, mode, transcript, debrief);
  }
}

// Checkpoint : sauvegarde la conversation en cours (une par dossier+mode)
export function checkpointConversation(
  dossierId: number,
  mode: string,
  transcript: string
): void {
  const ongoing = db
    .prepare(
      "SELECT id FROM debats WHERE dossier_id = ? AND mode = ? AND statut = 'en_cours' ORDER BY id DESC LIMIT 1"
    )
    .get(dossierId, mode) as { id: number } | undefined;
  if (ongoing) {
    db.prepare(
      "UPDATE debats SET transcript = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(transcript, ongoing.id);
  } else {
    db.prepare(
      "INSERT INTO debats (dossier_id, mode, transcript, statut, updated_at) VALUES (?, ?, ?, 'en_cours', datetime('now'))"
    ).run(dossierId, mode, transcript);
  }
}

export function getOngoingConversation(
  dossierId: number,
  mode: string
): { transcript: string } | null {
  const row = db
    .prepare(
      "SELECT transcript FROM debats WHERE dossier_id = ? AND mode = ? AND statut = 'en_cours' ORDER BY id DESC LIMIT 1"
    )
    .get(dossierId, mode) as { transcript: string } | undefined;
  return row ?? null;
}

// Conversations en cours (reprenables), tous modes
export function listOngoingConversations(dossierId: number) {
  return db
    .prepare(
      "SELECT id, mode, transcript, updated_at FROM debats WHERE dossier_id = ? AND statut = 'en_cours' ORDER BY updated_at DESC"
    )
    .all(dossierId) as {
    id: number;
    mode: string;
    transcript: string;
    updated_at: string;
  }[];
}

export function saveIngest(
  url: string,
  titre: string,
  resume: string,
  nbEntries: number
): void {
  db.prepare(
    "INSERT INTO ingests (url, titre, resume, nb_entries) VALUES (?, ?, ?, ?)"
  ).run(url, titre, resume, nbEntries);
}

export function listIngests(limit = 20) {
  return db
    .prepare("SELECT * FROM ingests ORDER BY created_at DESC LIMIT ?")
    .all(limit) as {
    id: number;
    url: string;
    titre: string | null;
    resume: string | null;
    nb_entries: number;
    created_at: string;
  }[];
}

// ---------- Vidéos (bibliothèque qui n'oublie pas) ----------

export type Video = {
  id: number;
  url: string;
  video_id: string | null;
  titre: string | null;
  resume: string | null;
  nb_entries: number;
  created_at: string;
};

export function saveVideo(
  url: string,
  videoId: string | null,
  titre: string,
  resume: string,
  placements: { dossierId: number; nb: number }[]
): number {
  const vid = Number(
    db
      .prepare(
        "INSERT INTO videos (url, video_id, titre, resume) VALUES (?, ?, ?, ?)"
      )
      .run(url, videoId, titre, resume).lastInsertRowid
  );
  const ins = db.prepare(
    "INSERT OR REPLACE INTO video_dossiers (video_id, dossier_id, nb_entries) VALUES (?, ?, ?)"
  );
  for (const p of placements) ins.run(vid, p.dossierId, p.nb);
  return vid;
}

export function listVideosForDossier(dossierId: number): Video[] {
  return db
    .prepare(
      `SELECT v.*, vd.nb_entries FROM videos v
       JOIN video_dossiers vd ON vd.video_id = v.id
       WHERE vd.dossier_id = ?
       ORDER BY v.created_at DESC`
    )
    .all(dossierId) as Video[];
}

export function listRecentVideos(limit = 8) {
  const vids = db
    .prepare("SELECT * FROM videos ORDER BY created_at DESC LIMIT ?")
    .all(limit) as Omit<Video, "nb_entries">[];
  const dq = db.prepare(
    `SELECT d.nom, d.slug FROM video_dossiers vd
     JOIN dossiers d ON d.id = vd.dossier_id WHERE vd.video_id = ?`
  );
  return vids.map((v) => ({
    ...v,
    dossiers: dq.all(v.id) as { nom: string; slug: string }[],
  }));
}

// ---------- Maîtrise (où j'en suis) ----------

export type Stats = {
  debats: number;
  faits: number;
  revOk: number;
  cards: number;
  cardsOk: number;
  lessonDone: number;
  lessonTotal: number;
};

// La maîtrise reflète le VRAI travail, pas le remplissage :
//  - Apprendre (40) : sous-points/étapes de leçon réellement maîtrisés.
//  - Ancrer (30) : flashcards + faits révisés avec succès (streak ≥ 2).
//  - Confronter (30) : débats menés.
export function maitriseScore(s: Stats): number {
  const apprendre =
    s.lessonTotal > 0 ? Math.round((s.lessonDone / s.lessonTotal) * 40) : 0;
  const ancrer =
    s.faits + s.cards > 0
      ? Math.round(((s.revOk + s.cardsOk) / (s.faits + s.cards)) * 30)
      : 0;
  const confronter = Math.min(30, s.debats * 10);
  return Math.min(100, apprendre + ancrer + confronter);
}

// Le cours (la leçon) est « fini » quand toutes les étapes sont conclues (plus
// aucune « pending » : maîtrisée ou au moins vue). C'est ce qui débloque la
// confrontation. Une étape coincée en « à revoir » ne verrouille pas tout.
export function lessonFinished(lecon: string | null): boolean {
  if (!lecon) return false;
  try {
    const s = JSON.parse(lecon) as { status?: string[] };
    const total = s.status?.length ?? 0;
    return total > 0 && !s.status!.some((x) => x === "pending");
  } catch {
    return false;
  }
}

// Progression de leçon depuis la colonne JSON `lecon` (étapes « done »).
function lessonProgress(lecon: string | null): { done: number; total: number } {
  if (!lecon) return { done: 0, total: 0 };
  try {
    const s = JSON.parse(lecon) as { status?: string[] };
    const total = s.status?.length ?? 0;
    const done = s.status?.filter((x) => x === "done").length ?? 0;
    return { done, total };
  } catch {
    return { done: 0, total: 0 };
  }
}

// Score de maîtrise de chaque dossier en quelques requêtes groupées
export function maitriseByDossier(): Record<number, number> {
  const count = (sql: string) =>
    Object.fromEntries(
      (db.prepare(sql).all() as { id: number; n: number }[]).map((r) => [
        r.id,
        r.n,
      ])
    );
  const faits = count(
    "SELECT dossier_id AS id, COUNT(*) AS n FROM entries WHERE type='fait' GROUP BY dossier_id"
  );
  const debats = count(
    "SELECT dossier_id AS id, COUNT(*) AS n FROM debats GROUP BY dossier_id"
  );
  const revOk = count(
    `SELECT e.dossier_id AS id, COUNT(*) AS n FROM revisions r
     JOIN entries e ON e.id = r.entry_id WHERE r.streak >= 2 GROUP BY e.dossier_id`
  );
  const cards = count(
    "SELECT dossier_id AS id, COUNT(*) AS n FROM dossier_cards GROUP BY dossier_id"
  );
  const cardsOk = count(
    "SELECT dossier_id AS id, COUNT(*) AS n FROM dossier_cards WHERE streak >= 2 GROUP BY dossier_id"
  );
  const dossiers = db.prepare("SELECT id, lecon FROM dossiers").all() as {
    id: number;
    lecon: string | null;
  }[];
  const out: Record<number, number> = {};
  for (const d of dossiers) {
    const lp = lessonProgress(d.lecon);
    out[d.id] = maitriseScore({
      debats: debats[d.id] ?? 0,
      faits: faits[d.id] ?? 0,
      revOk: revOk[d.id] ?? 0,
      cards: cards[d.id] ?? 0,
      cardsOk: cardsOk[d.id] ?? 0,
      lessonDone: lp.done,
      lessonTotal: lp.total,
    });
  }
  return out;
}

// Compte d'éléments par dossier en UNE requête (évite le N+1 sur l'accueil).
export function countEntriesByDossier(): Record<number, number> {
  return Object.fromEntries(
    (
      db
        .prepare(
          "SELECT dossier_id AS id, COUNT(*) AS n FROM entries GROUP BY dossier_id"
        )
        .all() as { id: number; n: number }[]
    ).map((r) => [r.id, r.n])
  );
}

export function maitriseFor(dossierId: number): number {
  const one = (sql: string) =>
    (db.prepare(sql).get(dossierId) as { n: number }).n;
  const d = db
    .prepare("SELECT lecon FROM dossiers WHERE id = ?")
    .get(dossierId) as { lecon: string | null };
  const lp = lessonProgress(d.lecon);
  return maitriseScore({
    debats: one("SELECT COUNT(*) AS n FROM debats WHERE dossier_id = ?"),
    faits: one(
      "SELECT COUNT(*) AS n FROM entries WHERE dossier_id = ? AND type='fait'"
    ),
    revOk: one(
      `SELECT COUNT(*) AS n FROM revisions r JOIN entries e ON e.id = r.entry_id
       WHERE e.dossier_id = ? AND r.streak >= 2`
    ),
    cards: one("SELECT COUNT(*) AS n FROM dossier_cards WHERE dossier_id = ?"),
    cardsOk: one(
      "SELECT COUNT(*) AS n FROM dossier_cards WHERE dossier_id = ? AND streak >= 2"
    ),
    lessonDone: lp.done,
    lessonTotal: lp.total,
  });
}

export function getEntry(id: number): Entry | undefined {
  return db.prepare("SELECT * FROM entries WHERE id = ?").get(id) as
    | Entry
    | undefined;
}

// ---------- Lectures (bibliothèque à vie) ----------

export type Livre = {
  id: number;
  dossier_id: number;
  titre: string;
  auteur: string;
  pages: number | null;
  tradition: string | null;
  pourquoi: string;
  cover_url: string | null;
  buy_url: string | null;
  lu: number;
  created_at: string;
};

export function saveBooks(
  dossierId: number,
  livres: {
    titre: string;
    auteur: string;
    pages: number | null;
    tradition: string | null;
    pourquoi: string;
    cover_url?: string | null;
    buy_url?: string | null;
  }[]
): void {
  const ins = db.prepare(
    "INSERT INTO livres (dossier_id, titre, auteur, pages, tradition, pourquoi, cover_url, buy_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  );
  for (const l of livres)
    ins.run(
      dossierId,
      l.titre,
      l.auteur,
      l.pages,
      l.tradition,
      l.pourquoi,
      l.cover_url ?? null,
      l.buy_url ?? null
    );
}

export function countBooks(dossierId: number): number {
  return (
    db
      .prepare("SELECT COUNT(*) AS n FROM livres WHERE dossier_id = ?")
      .get(dossierId) as { n: number }
  ).n;
}

export function listBooks(dossierId: number): Livre[] {
  return db
    .prepare(
      "SELECT * FROM livres WHERE dossier_id = ? ORDER BY lu, created_at DESC"
    )
    .all(dossierId) as Livre[];
}

export function toggleBook(id: number): void {
  db.prepare("UPDATE livres SET lu = 1 - lu WHERE id = ?").run(id);
}

export function deleteBook(id: number): void {
  db.prepare("DELETE FROM livres WHERE id = ?").run(id);
}

export function replaceContradictions(
  items: { texte: string; dossiers: string[] }[]
): void {
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM contradictions WHERE statut = 'ouverte'").run();
    const ins = db.prepare(
      "INSERT INTO contradictions (texte, dossiers) VALUES (?, ?)"
    );
    for (const c of items) ins.run(c.texte, JSON.stringify(c.dossiers));
  });
  tx();
}

export function listContradictions(): Contradiction[] {
  return db
    .prepare(
      "SELECT * FROM contradictions WHERE statut = 'ouverte' ORDER BY created_at DESC"
    )
    .all() as Contradiction[];
}

// ---------- Révisions espacées ----------

export function syncRevisions(): void {
  db.prepare(
    `INSERT OR IGNORE INTO revisions (entry_id)
     SELECT id FROM entries WHERE type = 'fait' AND valeur IS NOT NULL`
  ).run();
}

export type RevisionCard = Entry & {
  dossier_nom: string;
  dossier_slug: string;
};

export function listDueRevisions(limit = 30): RevisionCard[] {
  return db
    .prepare(
      `SELECT e.*, d.nom AS dossier_nom, d.slug AS dossier_slug
       FROM revisions r
       JOIN entries e ON e.id = r.entry_id
       JOIN dossiers d ON d.id = e.dossier_id
       WHERE r.due_at <= datetime('now')
       ORDER BY r.due_at
       LIMIT ?`
    )
    .all(limit) as RevisionCard[];
}

export function countDueRevisions(): number {
  const row = db
    .prepare(
      "SELECT COUNT(*) AS n FROM revisions WHERE due_at <= datetime('now')"
    )
    .get() as { n: number };
  return row.n;
}

export function gradeRevision(entryId: number, su: boolean): void {
  const r = db
    .prepare("SELECT interval_days, streak FROM revisions WHERE entry_id = ?")
    .get(entryId) as { interval_days: number; streak: number } | undefined;
  if (!r) return;
  const interval = su ? Math.max(1, r.interval_days * 2.3) : 1;
  const streak = su ? r.streak + 1 : 0;
  db.prepare(
    `UPDATE revisions
     SET interval_days = ?, streak = ?, due_at = datetime('now', '+' || ? || ' days')
     WHERE entry_id = ?`
  ).run(interval, streak, interval, entryId);
}

// ---------- Flashcards de dossier (générées en fin de leçon) ----------

// Fusionne les nouvelles cartes sans toucher aux existantes : on PRÉSERVE la
// progression de révision (streak/échéance). Les doublons (même question) sont
// ignorés ; seules les vraiment nouvelles sont ajoutées. Renvoie le nombre ajouté.
export function saveDossierCards(
  dossierId: number,
  cards: { question: string; reponse: string; type?: string }[]
): number {
  const seen = new Set(
    (
      db
        .prepare("SELECT question FROM dossier_cards WHERE dossier_id = ?")
        .all(dossierId) as { question: string }[]
    ).map((c) => c.question.trim().toLowerCase())
  );
  const ins = db.prepare(
    "INSERT INTO dossier_cards (dossier_id, question, reponse, type) VALUES (?, ?, ?, ?)"
  );
  let added = 0;
  for (const c of cards) {
    const key = c.question.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    ins.run(dossierId, c.question, c.reponse, c.type ?? "qa");
    seen.add(key);
    added++;
  }
  return added;
}

export function countDossierCards(dossierId: number): number {
  return (
    db
      .prepare("SELECT COUNT(*) AS n FROM dossier_cards WHERE dossier_id = ?")
      .get(dossierId) as { n: number }
  ).n;
}

export type DossierCard = {
  id: number;
  question: string;
  reponse: string;
  type: string;
  dossier_nom: string;
  interval_days: number;
  streak: number;
  ease: number;
};

export function listDueDossierCards(limit = 30): DossierCard[] {
  return db
    .prepare(
      `SELECT c.id, c.question, c.reponse, c.type, c.interval_days, c.streak, c.ease, d.nom AS dossier_nom
       FROM dossier_cards c JOIN dossiers d ON d.id = c.dossier_id
       WHERE c.due_at <= datetime('now')
       ORDER BY c.due_at
       LIMIT ?`
    )
    .all(limit) as DossierCard[];
}

// Cartes dues d'UN sujet (pour « réviser ce sujet »).
export function listDueDossierCardsFor(
  dossierId: number,
  limit = 50
): DossierCard[] {
  return db
    .prepare(
      `SELECT c.id, c.question, c.reponse, c.type, c.interval_days, c.streak, c.ease, d.nom AS dossier_nom
       FROM dossier_cards c JOIN dossiers d ON d.id = c.dossier_id
       WHERE c.dossier_id = ? AND c.due_at <= datetime('now')
       ORDER BY c.due_at
       LIMIT ?`
    )
    .all(dossierId, limit) as DossierCard[];
}

// ---------- Ressources (tweets, convs GPT, articles… rangés par sujet) ----------

export type Ressource = {
  id: number;
  dossier_id: number;
  type: string;
  titre: string;
  source: string | null;
  contenu: string;
  resume: string | null;
  points: string | null;
  created_at: string;
};

export function createRessource(
  dossierId: number,
  r: {
    type: string;
    titre: string;
    source: string | null;
    contenu: string;
    resume: string | null;
    points: string[] | null;
  }
): number {
  return Number(
    db
      .prepare(
        `INSERT INTO ressources (dossier_id, type, titre, source, contenu, resume, points)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        dossierId,
        r.type,
        r.titre,
        r.source,
        r.contenu,
        r.resume,
        r.points ? JSON.stringify(r.points) : null
      ).lastInsertRowid
  );
}

export function listRessources(dossierId: number): Ressource[] {
  return db
    .prepare(
      "SELECT * FROM ressources WHERE dossier_id = ? ORDER BY created_at DESC"
    )
    .all(dossierId) as Ressource[];
}

export function getRessource(id: number): Ressource | undefined {
  return db.prepare("SELECT * FROM ressources WHERE id = ?").get(id) as
    | Ressource
    | undefined;
}

export function deleteRessource(id: number): void {
  db.prepare("DELETE FROM ressources WHERE id = ?").run(id);
}

export function countRessources(dossierId: number): number {
  return (
    db
      .prepare("SELECT COUNT(*) AS n FROM ressources WHERE dossier_id = ?")
      .get(dossierId) as { n: number }
  ).n;
}

// ---------- Détection « tu zoomes trop » (sous-thème à sortir en sujet) ----------

export function saveSplitSuggestion(
  dossierId: number,
  json: string | null
): void {
  db.prepare("UPDATE dossiers SET split_suggestion = ? WHERE id = ?").run(
    json,
    dossierId
  );
}

// Déplace des ressources / des éléments vers un autre dossier (le nouveau sujet).
export function moveRessourcesToDossier(
  ids: number[],
  newDossierId: number
): void {
  if (!ids.length) return;
  const stmt = db.prepare(
    "UPDATE ressources SET dossier_id = ? WHERE id = ?"
  );
  const tx = db.transaction((list: number[]) => {
    for (const id of list) stmt.run(newDossierId, id);
  });
  tx(ids);
}

export function moveEntriesToDossier(
  ids: number[],
  newDossierId: number
): void {
  if (!ids.length) return;
  const stmt = db.prepare("UPDATE entries SET dossier_id = ? WHERE id = ?");
  const tx = db.transaction((list: number[]) => {
    for (const id of list) stmt.run(newDossierId, id);
  });
  tx(ids);
}

// Y a-t-il assez de matière pour qu'une athe userse de split ait du sens ?
export function materialCount(dossierId: number): number {
  const r = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM ressources WHERE dossier_id = ?) +
        (SELECT COUNT(*) FROM entries WHERE dossier_id = ?) AS n`
    )
    .get(dossierId, dossierId) as { n: number };
  return r.n;
}

export function countDueDossierCards(): number {
  return (
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM dossier_cards WHERE due_at <= datetime('now')"
      )
      .get() as { n: number }
  ).n;
}

// ---------- Conso IA (jauge forfait) ----------

export function logUsage(costUsd: number): void {
  if (!costUsd || costUsd <= 0 || !Number.isFinite(costUsd)) return;
  db.prepare("INSERT INTO usage_events (cost_usd) VALUES (?)").run(costUsd);
}

// Dépense de Socrates sur les 7 derniers jours (USD).
export function weekSpendUsd(): number {
  const r = db
    .prepare(
      "SELECT COALESCE(SUM(cost_usd), 0) AS s FROM usage_events WHERE created_at >= datetime('now', '-7 days')"
    )
    .get() as { s: number };
  return r.s;
}

// SM-2 (la famille d'algorithmes derrière Anki / SuperMemo). Qualité du rappel :
// 0 = raté, 1 = dur, 2 = bien, 3 = facile. Chaque carte garde un « facteur de
// facilité » (ease) : les cartes dures voient leur ease baisser (intervalles plus
// courts), les faciles l'augmenter (intervalles plus longs). Le raté relance
// l'apprentissage (intervalle court, ease pénalisé) sans repartir de zéro côté ease.
export function sm2(
  interval: number,
  streak: number,
  ease: number,
  q: number
): { interval: number; streak: number; ease: number } {
  const round = (x: number) => Math.round(x * 100) / 100;
  if (q <= 0) {
    // Raté : revient très vite (relearning), ease pénalisé, plancher 1.3.
    return { interval: 0, streak: 0, ease: round(Math.max(1.3, ease - 0.2)) };
  }
  let e = ease;
  if (q === 1) e = Math.max(1.3, ease - 0.15); // dur
  if (q === 3) e = ease + 0.15; // facile
  const s = streak + 1;
  let next: number;
  if (s === 1) next = q === 3 ? 4 : 1; // 1re réussite
  else if (s === 2) next = q === 3 ? 6 : 3; // 2e réussite
  else {
    const mult = q === 1 ? 1.2 : q === 3 ? e * 1.3 : e;
    next = Math.max(1, interval * mult);
  }
  return { interval: round(next), streak: s, ease: round(e) };
}

export function gradeDossierCard(id: number, quality: number): void {
  const r = db
    .prepare("SELECT interval_days, streak, ease FROM dossier_cards WHERE id = ?")
    .get(id) as
    | { interval_days: number; streak: number; ease: number }
    | undefined;
  if (!r) return;
  const n = sm2(r.interval_days, r.streak, r.ease ?? 2.5, quality);
  db.prepare(
    `UPDATE dossier_cards
     SET interval_days = ?, streak = ?, ease = ?, due_at = datetime('now', '+' || ? || ' days')
     WHERE id = ?`
  ).run(n.interval, n.streak, n.ease, n.interval, id);
}

// Supprimer une flashcard (l'utilisateur peut élaguer son deck).
export function deleteDossierCard(id: number): void {
  db.prepare("DELETE FROM dossier_cards WHERE id = ?").run(id);
}

// Annuler (Ctrl+Z) : on remet la carte dans l'état SM-2 capturé avant la note, et
// due tout de suite (elle était due quand on l'a vue), pour pouvoir re-choisir.
export function restoreDossierCard(
  id: number,
  interval: number,
  streak: number,
  ease: number
): void {
  db.prepare(
    `UPDATE dossier_cards
     SET interval_days = ?, streak = ?, ease = ?, due_at = datetime('now')
     WHERE id = ?`
  ).run(interval, streak, ease, id);
}

export type Examen = {
  id: number;
  dossier_id: number;
  sujet: string;
  copie: string | null;
  correction: string | null;
  created_at: string;
};

export function saveExamen(
  dossierId: number,
  sujet: string,
  copie: string | null,
  correction: string | null
): void {
  db.prepare(
    "INSERT INTO examens (dossier_id, sujet, copie, correction) VALUES (?, ?, ?, ?)"
  ).run(dossierId, sujet, copie, correction);
}

export function listExamens(limit = 10) {
  return db
    .prepare(
      `SELECT e.*, d.nom AS dossier_nom FROM examens e
       JOIN dossiers d ON d.id = e.dossier_id
       ORDER BY e.created_at DESC LIMIT ?`
    )
    .all(limit) as (Examen & { dossier_nom: string })[];
}

export function resolveContradiction(id: number): void {
  db.prepare("UPDATE contradictions SET statut = 'resolue' WHERE id = ?").run(
    id
  );
}

// ---------- Reading Space ----------

export type Book = {
  id: number;
  titre: string;
  auteur: string;
  statut: "not_started" | "reading" | "finished" | "abandoned";
  theme: string | null;
  difficulte: string | null;
  impact: string | null;
  cover_url: string | null;
  buy_url: string | null;
  pourquoi: string | null;
  objectif: string | null;
  synthese: string | null;
  pensee_avant: string | null;
  pensee_apres: string | null;
  conf_avant: number | null;
  conf_apres: number | null;
  date_started: string | null;
  date_finished: string | null;
  chapitres: string | null;
  created_at: string;
};

export type BookNote = {
  id: number;
  book_id: number;
  type: "chapitre" | "citation" | "idee" | "question" | "desaccord" | "argument";
  chapitre: string | null;
  contenu: string;
  created_at: string;
};

export type BookCard = {
  id: number;
  book_id: number;
  question: string;
  reponse: string;
  due_at: string;
  interval_days: number;
  streak: number;
};

export function createBook(
  titre: string,
  auteur: string,
  cover_url: string | null,
  buy_url: string | null
): number {
  return Number(
    db
      .prepare(
        "INSERT INTO books (titre, auteur, cover_url, buy_url, date_started) VALUES (?, ?, ?, ?, datetime('now'))"
      )
      .run(titre, auteur, cover_url, buy_url).lastInsertRowid
  );
}

export function getBook(id: number): Book | undefined {
  return db.prepare("SELECT * FROM books WHERE id = ?").get(id) as
    | Book
    | undefined;
}

export function listReadingBooks(): Book[] {
  return db
    .prepare(
      `SELECT * FROM books ORDER BY
        CASE statut WHEN 'reading' THEN 0 WHEN 'not_started' THEN 1 WHEN 'finished' THEN 2 ELSE 3 END,
        created_at DESC`
    )
    .all() as Book[];
}

export function updateBookBefore(
  id: number,
  pourquoi: string,
  objectif: string
): void {
  db.prepare("UPDATE books SET pourquoi = ?, objectif = ? WHERE id = ?").run(
    pourquoi,
    objectif,
    id
  );
}

export function saveBookChapters(id: number, chapitresJson: string): void {
  db.prepare("UPDATE books SET chapitres = ? WHERE id = ?").run(
    chapitresJson,
    id
  );
}

export function updateBookStatus(id: number, statut: Book["statut"]): void {
  if (statut === "finished") {
    db.prepare(
      "UPDATE books SET statut = ?, date_finished = datetime('now') WHERE id = ?"
    ).run(statut, id);
  } else {
    db.prepare("UPDATE books SET statut = ? WHERE id = ?").run(statut, id);
  }
}

export function deleteBookEntity(id: number): void {
  db.prepare("DELETE FROM books WHERE id = ?").run(id);
}

export function setBookDossiers(bookId: number, dossierIds: number[]): void {
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM book_dossiers WHERE book_id = ?").run(bookId);
    const ins = db.prepare(
      "INSERT OR IGNORE INTO book_dossiers (book_id, dossier_id) VALUES (?, ?)"
    );
    for (const d of dossierIds) ins.run(bookId, d);
  });
  tx();
}

export function listBookDossiers(bookId: number): Dossier[] {
  return db
    .prepare(
      `SELECT d.* FROM book_dossiers bd JOIN dossiers d ON d.id = bd.dossier_id
       WHERE bd.book_id = ? ORDER BY d.nom`
    )
    .all(bookId) as Dossier[];
}

export function addBookNote(
  bookId: number,
  type: BookNote["type"],
  contenu: string,
  chapitre: string | null
): void {
  db.prepare(
    "INSERT INTO book_notes (book_id, type, contenu, chapitre) VALUES (?, ?, ?, ?)"
  ).run(bookId, type, contenu, chapitre);
}

export function listBookNotes(bookId: number): BookNote[] {
  return db
    .prepare("SELECT * FROM book_notes WHERE book_id = ? ORDER BY created_at")
    .all(bookId) as BookNote[];
}

export function deleteBookNote(id: number): void {
  db.prepare("DELETE FROM book_notes WHERE id = ?").run(id);
}

export function saveBookSynthese(
  id: number,
  synthese: string,
  pensee_avant: string,
  pensee_apres: string,
  conf_avant: number,
  conf_apres: number
): void {
  db.prepare(
    "UPDATE books SET synthese = ?, pensee_avant = ?, pensee_apres = ?, conf_avant = ?, conf_apres = ? WHERE id = ?"
  ).run(synthese, pensee_avant, pensee_apres, conf_avant, conf_apres, id);
}

export function saveBookCards(
  bookId: number,
  cards: { question: string; reponse: string }[]
): void {
  const ins = db.prepare(
    "INSERT INTO book_cards (book_id, question, reponse) VALUES (?, ?, ?)"
  );
  for (const c of cards) ins.run(bookId, c.question, c.reponse);
}

export function listBookCards(bookId: number): BookCard[] {
  return db
    .prepare("SELECT * FROM book_cards WHERE book_id = ? ORDER BY id")
    .all(bookId) as BookCard[];
}

export function countBookCards(bookId: number): number {
  return (
    db
      .prepare("SELECT COUNT(*) AS n FROM book_cards WHERE book_id = ?")
      .get(bookId) as { n: number }
  ).n;
}

// ---------- Export / portabilité (ne jamais perdre de données) ----------

// Dump complet de toutes les tables → un JSON réimportable n'importe où
// (Postgres/Supabase, Turso/libSQL, autre SQLite). Inclut automatiquement
// toute nouvelle table.
export function exportAll(): { exported_at: string; tables: Record<string, unknown[]> } {
  const names = (
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream%'"
      )
      .all() as { name: string }[]
  ).map((t) => t.name);
  const tables: Record<string, unknown[]> = {};
  for (const n of names) tables[n] = db.prepare(`SELECT * FROM "${n}"`).all();
  return { exported_at: new Date().toISOString(), tables };
}

export default db;
