"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Le sommaire est récupéré en arrière-plan après la création du livre.
// On rafraîchit quelques fois pour le faire apparaître, puis on s'arrête
// (inutile de poller éternellement si la recherche n'a rien donné).
export function SommairePoller() {
  const router = useRouter();
  const tries = useRef(0);
  useEffect(() => {
    const id = setInterval(() => {
      tries.current += 1;
      if (tries.current > 12) {
        clearInterval(id);
        return;
      }
      router.refresh();
    }, 4000);
    return () => clearInterval(id);
  }, [router]);
  return null;
}
