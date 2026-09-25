import { NextRequest } from "next/server";
import { getDossier } from "@/lib/db";
import { buildLessonSystem, LESSON_MODEL, streamDebate } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 120;

// Le tuteur de la leçon guidée : streaming, scopé à l'étape en cours.
export async function POST(req: NextRequest) {
  const { slug, stepIndex, messages } = (await req.json()) as {
    slug: string;
    stepIndex: number;
    messages: { role: "user" | "assistant"; content: string }[];
  };

  const dossier = getDossier(slug);
  if (!dossier) return new Response("Dossier inconnu", { status: 404 });
  if (!dossier.cours) return new Response("Pas de leçon", { status: 400 });

  let cours: {
    enjeu: string;
    sections: { titre: string; corps: string }[];
  };
  try {
    cours = JSON.parse(dossier.cours);
  } catch {
    return new Response("Leçon illisible", { status: 400 });
  }

  const system = buildLessonSystem(dossier.nom, cours, stepIndex ?? 0);
  const stream = streamDebate(system, messages, LESSON_MODEL);

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err) {
        controller.enqueue(
          encoder.encode(`\n[Erreur de génération : ${String(err)}]`)
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
