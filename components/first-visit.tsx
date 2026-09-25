"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Première visite → on envoie vers l'onboarding.
export function FirstVisit() {
  const router = useRouter();
  useEffect(() => {
    if (!localStorage.getItem("socrates-onboarded")) {
      router.replace("/bienvenue");
    }
  }, [router]);
  return null;
}
