import Link from "next/link";
import { notFound } from "next/navigation";
import { getDossier, getOngoingConversation } from "@/lib/db";
import { DEBATE_MODES, type DebateMode } from "@/lib/ai";
import { DebateChat } from "./debate-chat";
import { ModeSelector } from "@/components/mode-selector";

type Msg = { role: "user" | "assistant"; content: string };

export default async function DebatePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { slug } = await params;
  const { mode: rawMode } = await searchParams;
  const dossier = getDossier(slug);
  if (!dossier) notFound();
  const mode = (DEBATE_MODES.some((m) => m.value === rawMode)
    ? rawMode
    : "destroy") as DebateMode;

  const ongoing = getOngoingConversation(dossier.id, mode);
  let initialMessages: Msg[] = [];
  if (ongoing) {
    try {
      initialMessages = JSON.parse(ongoing.transcript) as Msg[];
    } catch {
      initialMessages = [];
    }
  }

  return (
    <div className="flex h-screen flex-col px-6 py-8 md:px-12 lg:px-16">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <Link
            href={`/d/${dossier.slug}`}
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            ← {dossier.nom}
          </Link>
          <h1 className="mt-1 text-balance font-serif text-4xl tracking-tight">
            {DEBATE_MODES.find((m) => m.value === mode)?.label}
          </h1>
          <p className="mt-2 max-w-2xl text-[15px] text-muted-foreground">
            {DEBATE_MODES.find((m) => m.value === mode)?.desc}
          </p>
        </div>
        <div className="pb-1">
          <ModeSelector
            slug={dossier.slug}
            current={mode}
            currentLabel={DEBATE_MODES.find((m) => m.value === mode)?.label ?? ""}
            modes={DEBATE_MODES.map((m) => ({ value: m.value, label: m.label }))}
          />
        </div>
      </header>
      <DebateChat
        slug={dossier.slug}
        mode={mode}
        position={dossier.position}
        initialMessages={initialMessages}
        dossierId={dossier.id}
        notes={dossier.notes}
      />
    </div>
  );
}
