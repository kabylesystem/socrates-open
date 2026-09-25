"use client";

import { useEffect, useRef, useState } from "react";
import { actionUpdatePosition } from "@/app/actions";

// Position = ta vision développée du sujet, aussi longue que nécessaire.
// Champ libre, auto-sauvé (comme les notes), avec un curseur de confiance.
export function PositionEditor({
  dossierId,
  position,
  confiance,
}: {
  dossierId: number;
  position: string;
  confiance: number;
}) {
  const [pos, setPos] = useState(position);
  const [conf, setConf] = useState(confiance);
  const [state, setState] = useState<"idle" | "dirty" | "saved">("idle");
  const ref = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 72)}px`;
  }, [pos]);

  function save(p: string, c: number) {
    const fd = new FormData();
    fd.set("dossierId", String(dossierId));
    fd.set("position", p);
    fd.set("confiance", String(c));
    actionUpdatePosition(fd).then(() => {
      setState("saved");
      setTimeout(() => setState("idle"), 1500);
    });
  }

  function schedule(p: string, c: number) {
    setState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(p, c), 900);
  }

  return (
    <div className="relative max-w-4xl">
      <div className="flex items-center justify-between">
        <label htmlFor="position" className="text-[15px] text-muted-foreground">
          Ma position
        </label>
        <span
          className={`text-xs text-muted-foreground transition-opacity ${
            state === "saved" ? "opacity-100" : "opacity-0"
          }`}
        >
          enregistré
        </span>
      </div>
      <textarea
        id="position"
        ref={ref}
        value={pos}
        onChange={(e) => {
          setPos(e.target.value);
          schedule(e.target.value, conf);
        }}
        onBlur={() => state === "dirty" && save(pos, conf)}
        placeholder="Ta vision du sujet — aussi développée que tu veux. Elle s'enrichit avec le temps, l'IA t'aide à l'affiner."
        className="mt-3 w-full resize-none bg-transparent font-serif text-2xl leading-snug outline-none placeholder:text-muted-foreground/50 lg:text-3xl"
        spellCheck={false}
      />
      <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-border pt-5">
        <label htmlFor="confiance" className="text-[15px] text-muted-foreground">
          Confiance
        </label>
        <input
          id="confiance"
          type="range"
          min={0}
          max={100}
          step={5}
          value={conf}
          onChange={(e) => {
            const c = Number(e.target.value);
            setConf(c);
            schedule(pos, c);
          }}
          className="h-1 w-48 cursor-pointer accent-info"
        />
        <span
          className={`font-mono text-sm tabular-nums ${
            conf >= 70 ? "text-ok" : conf < 40 ? "text-destructive" : "text-info"
          }`}
        >
          {conf}%
        </span>
      </div>
    </div>
  );
}
