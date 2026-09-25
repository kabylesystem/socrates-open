"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Tant qu'une génération tourne en arrière-plan, on rafraîchit la page
// périodiquement pour voir apparaître les faits dès qu'ils sont prêts.
export function GenPoller() {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(id);
  }, [router]);
  return null;
}
