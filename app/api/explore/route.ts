import { NextRequest } from "next/server";
import { getDossier, getEntry } from "@/lib/db";
import { buildExploreSystem, streamExplore } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const { slug, entryId, messages } = (await req.json()) as {
    slug: string;
    entryId: number;
    messages: { role: "user" | "assistant"; content: string }[];
  };

  const dossier = getDossier(slug);
  const entry = getEntry(entryId);
  if (!dossier || !entry)
    return new Response("Introuvable", { status: 404 });

  const system = buildExploreSystem(dossier, entry);
  const stream = streamExplore(system, messages);

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
