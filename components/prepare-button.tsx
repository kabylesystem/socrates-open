"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

// Déclenche une génération en arrière-plan puis rafraîchit (la page passe en « busy »).
export function PrepareButton({
  slug,
  mode,
  children,
  variant,
  size,
}: {
  slug: string;
  mode: "skeleton" | "refresh" | "cours";
  children: React.ReactNode;
  variant?: "default" | "ghost" | "outline";
  size?: "default" | "sm" | "lg";
}) {
  const router = useRouter();
  const [sent, setSent] = useState(false);

  async function go() {
    setSent(true);
    try {
      await fetch("/api/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, mode }),
      });
      router.refresh();
    } catch {
      setSent(false);
    }
  }

  return (
    <Button onClick={go} disabled={sent} variant={variant} size={size}>
      {sent ? "Lancement…" : children}
    </Button>
  );
}
