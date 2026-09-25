"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

// Minuteur de session dans un coin de l'écran (présent sur toutes les pages via le
// layout). Pour se caler des blocs de travail (ex : 20 min de révision). Survit à la
// navigation (layout persistant) ET au rechargement (échéance sauvée en local).
const PRESETS = [15, 20, 25, 50];
const KEY = "socrates-timer-endsAt";

export function StudyTimer() {
  const pathname = usePathname();
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState<number | null>(null); // null au 1er rendu = anti-hydratation
  const [open, setOpen] = useState(false);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reprise depuis le stockage local (si un minuteur tournait avant un reload).
  useEffect(() => {
    const t = Number(localStorage.getItem(KEY));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    if (t && t > Date.now()) {
      setEndsAt(t);
    } else {
      localStorage.removeItem(KEY);
    }
  }, []);

  // Tic chaque seconde tant qu'un minuteur tourne (setState dans un callback = OK).
  useEffect(() => {
    if (endsAt == null) return;
    tick.current = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      if (tick.current) clearInterval(tick.current);
    };
  }, [endsAt]);

  const remaining =
    endsAt != null && now != null ? Math.max(0, Math.round((endsAt - now) / 1000)) : 0;
  const running = endsAt != null && remaining > 0;
  const finished = endsAt != null && remaining <= 0;

  function start(min: number) {
    // eslint-disable-next-line react-hooks/purity
    const base = Date.now();
    const t = base + min * 60 * 1000;
    setEndsAt(t);
    setNow(base);
    setOpen(false);
    localStorage.setItem(KEY, String(t));
  }
  function stop() {
    setEndsAt(null);
    setOpen(false);
    localStorage.removeItem(KEY);
  }

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const pill =
    "flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm shadow-lg backdrop-blur transition-colors";

  // Pas de minuteur pendant l'onboarding (il parasite l'écran d'accueil).
  if (pathname?.startsWith("/bienvenue")) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 select-none">
      {running ? (
        <div className={`${pill} border-border bg-popover/90 text-foreground`}>
          <span className="inline-block size-1.5 animate-pulse rounded-full bg-info" />
          <span className="font-mono tabular-nums text-[15px]">
            {mm}:{ss}
          </span>
          <button
            onClick={stop}
            aria-label="Arrêter le minuteur"
            className="ml-1 text-muted-foreground transition-colors hover:text-destructive"
          >
            ✕
          </button>
        </div>
      ) : finished ? (
        <button
          onClick={stop}
          className={`${pill} animate-pulse border-primary bg-primary/15 text-primary`}
        >
          Session terminée ✓
        </button>
      ) : open ? (
        <div className={`${pill} border-border bg-popover/95`}>
          <span className="text-xs text-muted-foreground">Minuteur</span>
          {PRESETS.map((m) => (
            <button
              key={m}
              onClick={() => start(m)}
              className="rounded-full px-2 py-0.5 font-mono text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {m}
            </button>
          ))}
          <span className="text-xs text-muted-foreground/60">min</span>
          <button
            onClick={() => setOpen(false)}
            aria-label="Fermer"
            className="ml-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          aria-label="Lancer un minuteur de session"
          title="Minuteur de session"
          className={`${pill} border-border bg-popover/80 text-muted-foreground hover:border-primary hover:text-primary`}
        >
          <svg
            viewBox="0 0 24 24"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <circle cx="12" cy="13" r="8" />
            <path d="M12 13V9M9 3h6" strokeLinecap="round" />
          </svg>
          <span className="text-[13px]">Minuteur</span>
        </button>
      )}
    </div>
  );
}
