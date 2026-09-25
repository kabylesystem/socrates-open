"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

// Affiche, pendant une action serveur longue, une suite de messages qui
// défilent — pour que l'attente ne soit pas un trou noir.
export function PendingCycler({ messages }: { messages: string[] }) {
  const { pending } = useFormStatus();
  const [i, setI] = useState(0);

  useEffect(() => {
    if (!pending) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setI(0);
      return;
    }
    const id = setInterval(
      () => setI((x) => (x + 1) % messages.length),
      3500
    );
    return () => clearInterval(id);
  }, [pending, messages.length]);

  if (!pending) return null;
  return (
    <p className="flex items-center gap-2.5 text-[15px] text-muted-foreground">
      <span className="inline-block size-2 shrink-0 animate-pulse rounded-full bg-info" />
      {messages[i]}
    </p>
  );
}
