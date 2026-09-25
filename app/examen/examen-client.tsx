"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { actionExamSubject, actionSubmitExam } from "@/app/actions";

type Img = { media_type: "image/jpeg"; data: string };

// Redimensionne une photo de copie (max 2000 px) et la convertit en JPEG base64
async function fileToImage(file: File): Promise<Img> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return { media_type: "image/jpeg", data: dataUrl.split(",")[1] };
}

const DUREE_SECONDES = 60 * 60;

type Phase = "idle" | "roulette" | "sujet" | "chrono" | "copie" | "corrige";

type Correction = {
  note_sur_20: number;
  appreciation: string;
  points_forts: string[];
  faiblesses_fond: string[];
  faiblesses_forme: string[];
  conseils: string[];
};

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function ExamenClient({
  dossiers,
}: {
  dossiers: { slug: string; nom: string }[];
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [affiche, setAffiche] = useState("?");
  const [tire, setTire] = useState<{ slug: string; nom: string } | null>(null);
  const [sujet, setSujet] = useState<{ sujet: string; cadrage: string } | null>(
    null
  );
  const [restant, setRestant] = useState(DUREE_SECONDES);
  const [copie, setCopie] = useState("");
  const [photos, setPhotos] = useState<Img[]>([]);
  const [correction, setCorrection] = useState<Correction | null>(null);
  const [busy, setBusy] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Chrono
  useEffect(() => {
    if (phase !== "chrono") return;
    timerRef.current = setInterval(() => {
      setRestant((r) => {
        if (r <= 1) {
          clearInterval(timerRef.current!);
          setPhase("copie");
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current!);
  }, [phase]);

  async function lancerRoulette() {
    setPhase("roulette");
    // Tirage aléatoire dans un handler de clic (pas pendant le render) : ok.
    // eslint-disable-next-line react-hooks/purity
    const gagnant = dossiers[Math.floor(Math.random() * dossiers.length)];
    setTire(gagnant);
    // Défilement qui ralentit puis s'arrête sur le tirage
    let i = 0;
    let delay = 60;
    const spin = () => {
      setAffiche(dossiers[i % dossiers.length].nom);
      i++;
      delay = Math.min(320, delay * 1.09);
      if (delay < 300) {
        setTimeout(spin, delay);
      } else {
        setAffiche(gagnant.nom);
        genererSujet(gagnant);
      }
    };
    spin();
  }

  async function genererSujet(gagnant: { slug: string; nom: string }) {
    setPhase("sujet");
    const s = await actionExamSubject(gagnant.slug);
    if (!s) {
      setPhase("idle");
      return;
    }
    setSujet(s);
  }

  function demarrer() {
    setRestant(DUREE_SECONDES);
    setPhase("chrono");
  }

  async function rendre(avecCopie: boolean) {
    if (!tire || !sujet || busy) return;
    setBusy(true);
    try {
      const result = await actionSubmitExam(
        tire.slug,
        sujet.sujet,
        avecCopie ? copie : "",
        avecCopie ? photos : []
      );
      if (result) {
        setCorrection(JSON.parse(result));
        setPhase("corrige");
      } else {
        setPhase("idle");
        setSujet(null);
        setTire(null);
        setCopie("");
        setPhotos([]);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <header className="border-b border-border pb-8">
        <h1 className="text-balance font-serif text-6xl tracking-tight lg:text-7xl">
          Examen
        </h1>
        <p className="mt-3 max-w-3xl text-[15px] text-muted-foreground">
          Un sujet au hasard, une heure, papier et stylo.
        </p>
      </header>

      {phase === "idle" && (
        <div className="py-16 text-center">
          <Button size="lg" onClick={lancerRoulette} className="px-10 text-base">
            Lancer la roulette
          </Button>
        </div>
      )}

      {(phase === "roulette" || phase === "sujet") && (
        <div className="py-16 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            Le sort désigne
          </p>
          <p
            className={`mt-4 text-balance font-serif text-5xl tracking-tight lg:text-6xl ${
              phase === "sujet" ? "text-primary" : ""
            }`}
          >
            {affiche}
          </p>
          {phase === "sujet" && !sujet && (
            <p className="mt-6 text-sm text-muted-foreground">
              Le jury rédige ton sujet…
            </p>
          )}
          {phase === "sujet" && sujet && (
            <div className="mx-auto mt-10 max-w-3xl border-t border-border pt-8 text-left">
              <p className="font-serif text-3xl leading-snug">{sujet.sujet}</p>
              <p className="mt-4 text-[15px] text-muted-foreground">
                {sujet.cadrage}
              </p>
              <div className="mt-8 text-center">
                <Button size="lg" onClick={demarrer} className="px-10">
                  Démarrer l&apos;heure
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {phase === "chrono" && sujet && (
        <div className="py-12 text-center">
          <p
            className={`font-mono text-8xl tabular-nums tracking-tight ${
              restant < 300 ? "text-destructive" : ""
            }`}
          >
            {fmt(restant)}
          </p>
          <p className="mx-auto mt-8 max-w-3xl text-balance font-serif text-2xl leading-snug">
            {sujet.sujet}
          </p>
          <p className="mt-6 text-sm text-muted-foreground">
            Papier, stylo, rien d&apos;autre. La page reste ouverte.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-10 text-muted-foreground"
            onClick={() => setPhase("copie")}
          >
            J&apos;ai fini avant l&apos;heure
          </Button>
        </div>
      )}

      {phase === "copie" && sujet && (
        <div className="py-10">
          <p className="font-serif text-2xl leading-snug">{sujet.sujet}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Photographie ta copie (ou recopie-la) pour la correction du jury.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-4">
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={async (e) => {
                  const files = [...(e.target.files ?? [])];
                  const imgs = await Promise.all(files.map(fileToImage));
                  setPhotos((p) => [...p, ...imgs]);
                  e.target.value = "";
                }}
              />
              <span className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm transition-colors hover:bg-accent">
                Photographier / choisir les pages
              </span>
            </label>
            {photos.map((img, i) => (
              <button
                key={i}
                onClick={() =>
                  setPhotos((p) => p.filter((_, j) => j !== i))
                }
                title="Retirer cette page"
                className="relative"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:image/jpeg;base64,${img.data}`}
                  alt={`Page ${i + 1}`}
                  className="h-20 w-14 rounded-sm border border-border object-cover transition-opacity hover:opacity-50"
                />
              </button>
            ))}
          </div>

          <Textarea
            value={copie}
            onChange={(e) => setCopie(e.target.value)}
            placeholder="…ou recopie ta copie ici"
            className="mt-6 min-h-48 max-w-4xl font-serif text-lg leading-relaxed"
          />
          <div className="mt-4 flex gap-3">
            <Button
              onClick={() => rendre(true)}
              disabled={busy || (!copie.trim() && photos.length === 0)}
            >
              {busy ? "Le jury corrige…" : "Rendre au jury"}
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => rendre(false)}
              className="text-muted-foreground"
            >
              Enregistrer sans correction
            </Button>
          </div>
        </div>
      )}

      {phase === "corrige" && correction && (
        <div className="py-10">
          <p className="font-mono text-7xl tabular-nums">
            {correction.note_sur_20}
            <span className="text-3xl text-muted-foreground">/20</span>
          </p>
          <p className="mt-4 max-w-3xl font-serif text-2xl leading-snug">
            {correction.appreciation}
          </p>
          {(
            [
              ["Points forts", correction.points_forts, ""],
              ["Faiblesses de fond", correction.faiblesses_fond, "text-destructive"],
              ["Faiblesses de forme", correction.faiblesses_forme, "text-destructive"],
              ["Conseils", correction.conseils, ""],
            ] as [string, string[], string][]
          ).map(
            ([titre, items, cls]) =>
              items.length > 0 && (
                <div key={titre} className="mt-6 border-t border-border pt-5">
                  <p className={`text-[15px] ${cls}`}>{titre}</p>
                  <ul className="mt-2 max-w-3xl list-disc space-y-1 pl-5 text-[15px] text-muted-foreground">
                    {items.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </div>
              )
          )}
          <Button
            variant="ghost"
            className="mt-8 text-muted-foreground"
            onClick={() => {
              setPhase("idle");
              setSujet(null);
              setTire(null);
              setCopie("");
              setPhotos([]);
              setCorrection(null);
            }}
          >
            Terminé
          </Button>
        </div>
      )}
    </div>
  );
}
