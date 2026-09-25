// Sauvegarde locale : copie cohérente de la base + dump JSON portable.
// Usage : npm run backup  (garde les 15 dernières).
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "socrates.db");
const backupDir = path.join(dataDir, "backups");

if (!fs.existsSync(dbPath)) {
  console.error("Aucune base à sauvegarder :", dbPath);
  process.exit(1);
}
fs.mkdirSync(backupDir, { recursive: true });

const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const db = new Database(dbPath, { readonly: true });

// Copie binaire cohérente (gère le WAL).
await db.backup(path.join(backupDir, `socrates-${ts}.db`));

// Dump JSON (toutes les tables).
const names = db
  .prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  )
  .all()
  .map((t) => t.name);
const tables = {};
for (const n of names) tables[n] = db.prepare(`SELECT * FROM "${n}"`).all();
fs.writeFileSync(
  path.join(backupDir, `socrates-${ts}.json`),
  JSON.stringify({ exported_at: new Date().toISOString(), tables }, null, 2)
);
db.close();

// Rotation : ne garder que les 15 dernières sauvegardes de chaque type.
for (const ext of [".db", ".json"]) {
  const files = fs
    .readdirSync(backupDir)
    .filter((f) => f.startsWith("socrates-") && f.endsWith(ext))
    .sort()
    .reverse();
  for (const old of files.slice(15))
    fs.unlinkSync(path.join(backupDir, old));
}

console.log(`Sauvegarde OK → data/backups/socrates-${ts}.{db,json}`);
