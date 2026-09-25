"use client";

import { useRef, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { actionAppendNote } from "@/app/actions";

type Msg = { role: "user" | "assistant"; content: string };

export function ExploreSheet({
  slug,
  entryId,
  dossierId,
  titre,
  children,
}: {
  slug: string;
  entryId: number;
  dossierId: number;
  titre: string;
  children: React.ReactNode;
}) {
  const [noted, setNoted] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);
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
    stick.current = true;
    setMessages([...next, { role: "assistant", content: "" }]);
    setBusy(true);
    try {
      const res = await fetch("/api/explore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, entryId, messages: next }),
      });
      if (!res.ok || !res.body) throw new Error(await res.text());
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setMessages([...next, { role: "assistant", content: acc }]);
        toBottom();
      }
      setMessages([...next, { role: "assistant", content: acc }]);
    } catch (e) {
      setMessages([
        ...next,
        { role: "assistant", content: `[Erreur : ${String(e)}]` },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function onOpenChange(o: boolean) {
    setOpen(o);
    if (o && !started.current) {
      started.current = true;
      void send("Explique-moi ce point en quelques phrases.");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-xl"
      >
        <SheetHeader className="border-b border-border">
          <SheetTitle className="font-serif text-xl font-normal leading-snug">
            {titre}
          </SheetTitle>
        </SheetHeader>
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="min-h-0 flex-1 overflow-y-auto px-5 pb-4"
        >
          {messages.map((m, i) => (
            <div key={i} className="group border-b border-border py-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {m.role === "user" ? "Moi" : "Socrates"}
              </p>
              <p
                className={`mt-1.5 whitespace-pre-wrap leading-relaxed ${
                  m.role === "assistant"
                    ? "font-serif text-[15px]"
                    : "text-[15px]"
                }`}
              >
                {m.content || "…"}
              </p>
              {m.role === "assistant" && m.content && (
                <button
                  onClick={() => {
                    void actionAppendNote(
                      dossierId,
                      `[${titre}] ${m.content}`
                    );
                    setNoted(i);
                    setTimeout(() => setNoted(null), 1500);
                  }}
                  className="mt-2 text-xs text-muted-foreground transition-colors hover:text-primary"
                >
                  {noted === i ? "ajouté ✓" : "→ mes notes"}
                </button>
              )}
            </div>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="flex items-end gap-2 border-t border-border p-4"
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
            placeholder="Une question sur ce point…"
            className="min-h-12 flex-1 resize-none"
          />
          <Button type="submit" disabled={busy || !input.trim()}>
            Envoyer
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
