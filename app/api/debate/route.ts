import { NextRequest } from "next/server";
import { getDossier, listEntries } from "@/lib/db";
import {
  buildDebateSystem,
  modelForMode,
  streamDebate,
  type DebateMode,
} from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const { slug, mode, messages } = (await req.json()) as {
    slug: string;
    mode: DebateMode;
    messages: { role: "user" | "assistant"; content: string }[];
  };

  const dossier = getDossier(slug);
  if (!dossier) return new Response("Dossier inconnu", { status: 404 });

  const system = buildDebateSystem(mode, dossier, listEntries(dossier.id));
  const stream = streamDebate(system, messages, modelForMode(mode));

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
