"use client";

import { useEffect, useRef, useState } from "react";
import { actionUpdateNotes } from "@/app/actions";

export function NotesEditor({
  dossierId,
  initial,
}: {
  dossierId: number;
  initial: string;
}) {
  const [value, setValue] = useState(initial);
  const [state, setState] = useState<"idle" | "dirty" | "saved">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-grandit avec le contenu
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 160)}px`;
  }, [value]);

  function save(v: string) {
    actionUpdateNotes(dossierId, v).then(() => {
      setState("saved");
      setTimeout(() => setState("idle"), 1500);
    });
  }

  function onChange(v: string) {
    setValue(v);
    setState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(v), 900);
  }

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => state === "dirty" && save(value)}
        placeholder="Écris. Idées, plans, brouillons d'arguments : c'est ton espace de travail, il s'enregistre tout seul."
        className="w-full resize-none bg-transparent font-serif text-lg leading-relaxed outline-none placeholder:text-muted-foreground/60"
        spellCheck={false}
      />
      <span
        className={`pointer-events-none absolute -top-7 right-0 text-xs text-muted-foreground transition-opacity ${
          state === "saved" ? "opacity-100" : "opacity-0"
        }`}
      >
        enregistré
      </span>
    </div>
  );
}
