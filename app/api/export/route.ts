import { exportAll } from "@/lib/db";

export const runtime = "nodejs";

// Télécharge TOUTES tes données dans un seul JSON, réimportable n'importe où
// (Turso/libSQL, Supabase/Postgres, autre SQLite). Garantie anti-perte.
export async function GET() {
  const data = exportAll();
  const date = data.exported_at.slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="socrates-export-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
