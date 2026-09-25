"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Compass,
  Dices,
  Download,
  Layers,
  Plus,
  PanelLeft,
  PanelLeftClose,
  HelpCircle,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { CreditGauge } from "@/components/credit-gauge";
import { actionCreateDossier } from "@/app/actions";

type DossierLite = {
  slug: string;
  nom: string;
  position: string;
  confiance: number;
};

export function Sidebar({
  groups,
  dues,
  contradictions,
  weekSpend,
}: {
  groups: [string, DossierLite[]][];
  dues: number;
  contradictions: number;
  weekSpend: number;
}) {
  const [open, setOpen] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    // Préférence d'ouverture lue depuis localStorage au montage (système externe).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (localStorage.getItem("sidebar-open") === "0") setOpen(false);
  }, []);

  function toggle() {
    setOpen((o) => {
      localStorage.setItem("sidebar-open", o ? "0" : "1");
      return !o;
    });
  }

  if (!open) {
    return (
      <div className="hidden shrink-0 border-r border-sidebar-border bg-sidebar md:block">
        <button
          onClick={toggle}
          aria-label="Ouvrir le menu"
          className="p-4 text-muted-foreground transition-colors hover:text-foreground"
        >
          <PanelLeft className="size-5" />
        </button>
      </div>
    );
  }

  return (
    <aside className="hidden w-72 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
      <div className="flex items-center justify-between px-8 py-7">
        <Link href="/" className="font-serif text-2xl text-sidebar-foreground">
          Socrates
        </Link>
        <button
          onClick={toggle}
          aria-label="Réduire le menu"
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <PanelLeftClose className="size-4" />
        </button>
      </div>
      <Separator />
      <div className="space-y-1 px-8 py-5">
        <Link
          href="/ajouter"
          className="flex items-center gap-2.5 py-1.5 text-[15px] text-sidebar-foreground transition-colors hover:text-primary"
        >
          <Plus className="size-4 text-primary" aria-hidden />
          Ajouter
        </Link>
        <Link
          href="/reviser"
          className="flex items-center gap-2.5 py-1.5 text-[15px] text-sidebar-foreground transition-colors hover:text-primary"
        >
          <Layers className="size-4 text-primary" aria-hidden />
          Réviser
          {dues > 0 && (
            <span className="ml-auto font-mono text-xs tabular-nums text-info">
              {dues}
            </span>
          )}
        </Link>
      </div>
      <Separator />
      <nav className="flex-1 overflow-y-auto px-8 py-6">
        {groups.map(([categorie, items]) => (
          <div key={categorie} className="group/cat pb-8">
            <div className="flex items-center justify-between pb-2">
              <p className="text-xs font-medium tracking-wide text-muted-foreground/70">
                {categorie}
              </p>
              <button
                type="button"
                aria-label={`Ajouter un sujet dans ${categorie}`}
                title={`Ajouter un sujet dans ${categorie}`}
                onClick={() => setAdding((c) => (c === categorie ? null : categorie))}
                className="text-muted-foreground/40 opacity-0 transition-all hover:text-primary group-hover/cat:opacity-100"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
            {adding === categorie && (
              <form
                action={actionCreateDossier}
                onSubmit={() => setAdding(null)}
                className="pb-2"
              >
                <input type="hidden" name="categorie" value={categorie} />
                <input
                  name="nom"
                  autoFocus
                  required
                  placeholder="Nouveau sujet, puis Entrée…"
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setAdding(null);
                  }}
                  className="w-full border-b border-border bg-transparent py-1 text-[15px] text-sidebar-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary"
                />
              </form>
            )}
            {items.map((d) => (
              <Link
                key={d.slug}
                href={`/d/${d.slug}`}
                className="flex items-baseline justify-between gap-3 py-1.5 text-[15px] text-muted-foreground transition-colors hover:text-sidebar-foreground"
              >
                <span className="truncate">{d.nom}</span>
                <span
                  className={`font-mono text-[11px] tabular-nums ${
                    d.position
                      ? d.confiance >= 70
                        ? "text-ok"
                        : d.confiance < 40
                          ? "text-destructive"
                          : ""
                      : ""
                  }`}
                >
                  {d.position ? `${d.confiance}%` : ""}
                </span>
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <Separator />
      <div className="space-y-2.5 px-8 py-5 text-sm">
        <div className="flex items-center gap-5 pb-1">
          <Link
            href="/lire"
            className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
          >
            <BookOpen className="size-4" aria-hidden />
            Lire
          </Link>
          <Link
            href="/examen"
            className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
          >
            <Dices className="size-4" aria-hidden />
            Examen
          </Link>
        </div>
        {contradictions > 0 && (
          <Link
            href="/"
            className="block text-destructive transition-colors hover:text-foreground"
          >
            {contradictions} contradiction{contradictions > 1 ? "s" : ""} ouverte
            {contradictions > 1 ? "s" : ""}
          </Link>
        )}
        <Link
          href="/parcours"
          className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
        >
          <Compass className="size-4" aria-hidden />
          Parcours conseillé
        </Link>
        <Link
          href="/bienvenue"
          className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
        >
          <HelpCircle className="size-4" aria-hidden />
          Découvrir Socrates
        </Link>
        <a
          href="/api/export"
          download
          className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
        >
          <Download className="size-4" aria-hidden />
          Exporter mes données
        </a>
        <div className="pt-1">
          <CreditGauge spend={weekSpend} pool={100} />
        </div>
      </div>
    </aside>
  );
}
