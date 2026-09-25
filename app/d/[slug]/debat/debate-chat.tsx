"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { NotesEditor } from "@/components/notes-editor";
import { actionCheckpoint, actionSaveDebate } from "@/app/actions";

type Msg = { role: "user" | "assistant"; content: string };

export function DebateChat({
  slug,
  mode,
  position,
  initialMessages,
  dossierId,
  notes,
}: {
  slug: string;
  mode: string;
  position: string;
  initialMessages: Msg[];
  dossierId: number;
  notes: string;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // « Collé en bas » : on n'auto-scrolle pendant l'écriture QUE si tu es déjà en bas.
  const stick = useRef(true);
  function onScroll() {
    const el = scrollRef.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }
  function toBottom() {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    setInput("");
    const next: Msg[] = [...messages, { role: "user", content }];
    stick.current = true; // tu viens d'envoyer → recollé en bas
    setMessages([...next, { role: "assistant", content: "" }]);
    setBusy(true);
    try {
      const res = await fetch("/api/debate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, mode, messages: next }),
      });
      if (!res.ok || !res.body) throw new Error(await res.text());
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages([...next, { role: "assistant", content: acc }]);
        toBottom();
      }
      const full: Msg[] = [...next, { role: "assistant", content: acc }];
      setMessages(full);
      // Checkpoint : on pourra reprendre cette conversation plus tard
      void actionCheckpoint(slug, mode, full);
    } catch (e) {
      setMessages([
        ...next,
        { role: "assistant", content: `[Erreur : ${String(e)}]` },
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    if (messages.length === 0 || saving) return;
    setSaving(true);
    try {
      await actionSaveDebate(slug, mode, messages);
      router.push(`/d/${slug}`);
    } finally {
      setSaving(false);
    }
  }

  const acteur =
    mode === "cours" ? "Professeur" : "Adversaire";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto py-6">
        {messages.length === 0 && (
          <div className="max-w-3xl">
            <p className="font-serif text-2xl leading-snug text-muted-foreground">
              {mode === "cours"
                ? "Tu pars de zéro. Le professeur va t'enseigner le sujet pas à pas."
                : position.trim()
                  ? "À toi d'ouvrir. Ou laisse l'adversaire attaquer."
                  : "Pas encore d'avis ? Laisse-le te questionner."}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() =>
                send(
                  mode === "cours"
                    ? "Je découvre ce sujet et je n'y connais presque rien. Commence le cours par les bases."
                    : position.trim()
                      ? `Voici ma position : ${position}. Attaque en premier.`
                      : "Je ne sais pas encore quoi penser de ce sujet. Questionne-moi pour m'aider à dégager une position."
                )
              }
              disabled={busy}
            >
              {mode === "cours"
                ? "Commencer le cours"
                : position.trim()
                  ? "Laisser l'adversaire ouvrir"
                  : "Commencer"}
            </Button>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className="border-b border-border py-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {m.role === "user" ? "Moi" : acteur}
            </p>
            <p
              className={`mt-2 max-w-3xl whitespace-pre-wrap leading-relaxed ${
                m.role === "assistant" ? "font-serif text-lg" : "text-[15px]"
              }`}
            >
              {m.content || "…"}
            </p>
          </div>
        ))}
      </div>

      <div className="border-t border-border py-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="flex items-end gap-3"
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Ta réplique… (Entrée pour envoyer)"
            className="min-h-20 flex-1 resize-none"
          />
          <div className="flex flex-col gap-2">
            <Button type="submit" disabled={busy || !input.trim()}>
              Envoyer
            </Button>
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                >
                  Notes
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="flex w-full flex-col sm:max-w-lg">
                <SheetHeader>
                  <SheetTitle className="font-serif text-xl font-normal">
                    Notes
                  </SheetTitle>
                </SheetHeader>
                <div className="min-h-0 flex-1 overflow-y-auto px-4">
                  <NotesEditor dossierId={dossierId} initial={notes} />
                </div>
              </SheetContent>
            </Sheet>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={messages.length === 0 || busy || saving}
              onClick={finish}
              className="text-muted-foreground"
            >
              {saving
                ? "Débrief en cours…"
                : mode === "cours"
                  ? "Terminer le cours"
                  : "Terminer + débrief"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
