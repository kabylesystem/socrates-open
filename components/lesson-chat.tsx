"use client";

import { memo, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  actionClipToNotes,
  actionGenerateStepCards,
  actionSaveLesson,
} from "@/app/actions";

type Msg = { role: "user" | "assistant"; content: string };

// Mémoïsé : pendant le streaming seul le dernier message change, les autres ne
// re-render pas — la conversation ne lague jamais, même très longue.
const Message = memo(function Message({
  role,
  content,
}: {
  role: "user" | "assistant";
  content: string;
}) {
  return (
    <div className="border-b border-border py-5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {role === "user" ? "Moi" : "Tuteur"}
      </p>
      <p
        data-tuteur={role === "assistant" ? "1" : undefined}
        className={`mt-2 whitespace-pre-wrap leading-relaxed ${
          role === "assistant" ? "font-serif text-lg" : "text-[15px]"
        }`}
      >
        {content || "…"}
      </p>
    </div>
  );
});
type Status = "pending" | "done" | "review";
type LessonState = {
  stepIndex: number;
  messages: Msg[];
  mastered: number[];
  status: Status[];
};

// Marqueurs techniques émis par le tuteur (sous-point validé / vu, étape
// maîtrisée / à revoir). On les retire de l'affichage et on s'en sert pour suivre
// la maîtrise réelle, validée par les bonnes réponses.
const MARKERS = ["[POINT_OK]", "[POINT_VU]", "[ÉTAPE_OK]", "[ÉTAPE_VU]"];
// Retire les marqueurs techniques + nettoie un éventuel markdown (gras, titres,
// séparateurs) que le modèle glisse parfois, pour un affichage propre en texte brut.
const strip = (s: string) =>
  MARKERS.reduce((a, m) => a.split(m).join(""), s)
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^\s*---+\s*$/gm, "")
    .trimEnd();
const count = (s: string, m: string) => s.split(m).length - 1;

export function LessonChat({
  slug,
  steps,
  initial,
  initialCards = 0,
}: {
  slug: string;
  steps: string[];
  initial?: LessonState;
  initialCards?: number;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [status, setStatus] = useState<Status[]>(() => steps.map(() => "pending"));
  const [mastered, setMastered] = useState<number[]>(() => steps.map(() => 0));
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [clip, setClip] = useState<{ text: string; x: number; y: number } | null>(
    null
  );
  const [toast, setToast] = useState("");
  const started = useRef(false);
  const stepCardsDone = useRef<Set<number>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  // « Collé en bas » : pendant que le tuteur écrit, on n'auto-scrolle QUE si tu es
  // déjà en bas. Si tu remontes lire, on ne te ramène plus de force.
  const stick = useRef(true);
  function onScroll() {
    const el = scrollRef.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }
  function toBottom() {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }
  // Compteur de flashcards, version « petit kiffe » : pour CHAQUE carte créée, une
  // vraie mini-carte naît au cœur de la conversation et VOLE en tournoyant jusqu'au
  // compteur ; à l'atterrissage le chiffre pope, un +1 s'envole, la pastille brille.
  type Flyer = { id: number; x: number; y: number; tx: number; ty: number; rot: number };
  const [cards, setCards] = useState(initialCards);
  const [counting, setCounting] = useState(false);
  const [floats, setFloats] = useState<number[]>([]);
  const [flyers, setFlyers] = useState<Flyer[]>([]);
  const cardsRef = useRef(initialCards);
  const cardTarget = useRef(initialCards);
  const floatId = useRef(0);
  const cardTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const counterRef = useRef<HTMLSpanElement>(null);

  // Fait naître une mini-carte dans la conversation et la fait voler vers le compteur.
  function spawnFlyer() {
    const zone = scrollRef.current?.getBoundingClientRect();
    const target = counterRef.current?.getBoundingClientRect();
    if (!zone || !target) return;
    // Départ : au cœur de la conversation, avec un peu d'aléa pour la vie.
    const x = zone.left + zone.width * (0.42 + Math.random() * 0.16);
    const y = zone.top + zone.height * (0.45 + Math.random() * 0.2);
    const id = ++floatId.current;
    setFlyers((f) => [
      ...f,
      {
        id,
        x,
        y,
        tx: target.left + target.width / 2 - x,
        ty: target.top + target.height / 2 - y,
        rot: Math.random() * 22 - 11,
      },
    ]);
    setTimeout(() => setFlyers((f) => f.filter((k) => k.id !== id)), 700);
  }

  function bumpCardsTo(total: number) {
    if (total <= cardTarget.current) return;
    cardTarget.current = total;
    if (cardTimer.current) return; // une montée est déjà en cours, on l'a juste rallongée
    setCounting(true);
    cardTimer.current = setInterval(() => {
      if (cardsRef.current >= cardTarget.current) {
        if (cardTimer.current) clearInterval(cardTimer.current);
        cardTimer.current = null;
        setTimeout(() => setCounting(false), 700); // la dernière carte finit son vol
        return;
      }
      cardsRef.current += 1;
      spawnFlyer();
      // L'incrément + le « +1 » attendent l'ATTERRISSAGE de la carte (fin du vol).
      setTimeout(() => {
        setCards((v) => v + 1);
        const id = ++floatId.current;
        setFloats((f) => [...f, id]);
        setTimeout(() => setFloats((f) => f.filter((x) => x !== id)), 750);
      }, 520);
    }, 230);
  }
  useEffect(() => () => {
    if (cardTimer.current) clearInterval(cardTimer.current);
  }, []);

  // Démo/debug : déclenche l'animation de N cartes depuis la console
  // (window.__cardsDemo(5)). Purement visuel, ne touche pas la base.
  useEffect(() => {
    (window as unknown as { __cardsDemo?: (n?: number) => void }).__cardsDemo = (
      n = 5
    ) => bumpCardsTo(cardTarget.current + n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lastStep = stepIndex >= steps.length - 1;
  const stepState = status[stepIndex];
  const stepDone = stepState !== "pending";
  const allDone = status.every((s) => s !== "pending");
  const key = `lecon-${slug}`;

  function save(step: number, msgs: Msg[], mast: number[], stat: Status[]) {
    const state: LessonState = {
      stepIndex: step,
      messages: msgs,
      mastered: mast,
      status: stat,
    };
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {}
    void actionSaveLesson(slug, state);
  }

  async function send(text: string, forStep = stepIndex) {
    const content = text.trim();
    if (!content || busy) return;
    const next: Msg[] = [...messages, { role: "user", content }];
    stick.current = true; // tu viens d'envoyer → on te recolle en bas
    setMessages([...next, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, stepIndex: forStep, messages: next }),
      });
      if (!res.ok || !res.body) throw new Error(await res.text());
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages([...next, { role: "assistant", content: strip(acc) }]);
        toBottom(); // ne descend QUE si tu es déjà en bas (sinon on te laisse lire)
      }
      const full: Msg[] = [...next, { role: "assistant", content: strip(acc) }];
      setMessages(full);
      // Maîtrise réelle : on compte les sous-points validés et l'état de l'étape.
      const gained = count(acc, "[POINT_OK]");
      const newMastered = mastered.map((v, i) => (i === forStep ? v + gained : v));
      const newStatus = acc.includes("[ÉTAPE_OK]")
        ? status.map((v, i) => (i === forStep ? ("done" as Status) : v))
        : acc.includes("[ÉTAPE_VU]")
          ? status.map((v, i) => (i === forStep ? ("review" as Status) : v))
          : status;
      setMastered(newMastered);
      setStatus(newStatus);
      save(forStep, full, newMastered, newStatus);
      // Au fil de l'eau : dès qu'une étape est conclue, ses flashcards se créent
      // toutes seules (une fois par étape). Pas d'attente de la fin du cours.
      if (newStatus[forStep] !== "pending" && !stepCardsDone.current.has(forStep)) {
        stepCardsDone.current.add(forStep);
        void actionGenerateStepCards(slug, steps[forStep]).then((total) => {
          if (typeof total === "number") bumpCardsTo(total);
        });
      }
    } catch (e) {
      setMessages([...next, { role: "assistant", content: `[Erreur : ${String(e)}]` }]);
    } finally {
      setBusy(false);
    }
  }

  function nextStep() {
    if (busy || lastStep) return;
    const ns = stepIndex + 1;
    setStepIndex(ns);
    void send(`Passons à l'étape « ${steps[ns]} ». Enseigne-la-moi.`, ns);
  }

  function onMouseUp() {
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? "";
    if (!text || text.length < 3) {
      setClip(null);
      return;
    }
    const node = sel?.anchorNode?.parentElement?.closest("[data-tuteur]");
    if (!node) {
      setClip(null);
      return;
    }
    const rect = sel!.getRangeAt(0).getBoundingClientRect();
    setClip({ text, x: rect.left + rect.width / 2, y: rect.top });
  }

  async function clipToNotes() {
    if (!clip) return;
    const text = clip.text;
    setClip(null);
    window.getSelection()?.removeAllRanges();
    setToast("✓ ajouté aux notes · carte sur mesure en préparation…");
    // La note part tout de suite ; la carte issue du surlignage arrive ensuite et
    // VOLE vers le compteur (bumpCardsTo) dès que le serveur renvoie le total.
    const total = await actionClipToNotes(slug, steps[stepIndex], text);
    if (typeof total === "number") bumpCardsTo(total);
    setToast("");
  }

  // Démarrage : reprend (serveur > local), sinon lance l'étape 1.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const seed = (s: LessonState) => {
      setStepIndex(Math.min(s.stepIndex ?? 0, steps.length - 1));
      setMessages(s.messages);
      if (s.mastered?.length === steps.length) setMastered(s.mastered);
      if (s.status?.length === steps.length) setStatus(s.status);
    };
    if (initial?.messages?.length) {
      seed(initial);
      return;
    }
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const s = JSON.parse(saved) as LessonState;
        if (s.messages?.length) {
          seed(s);
          return;
        }
      }
    } catch {}
    // Premier message du tuteur au montage (système externe : le flux IA).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void send(`Commence l'étape « ${steps[0]} ». Enseigne-la-moi pas à pas.`, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reprise / nouveau message : on descend en bas, mais seulement si tu y es déjà
  // (au montage stick=true → reprise en bas ; après, respecte ta position de lecture).
  useEffect(() => {
    toBottom();
  }, [messages.length]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Progression */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border py-4">
        <div className="flex items-center gap-1.5">
          {steps.map((_, i) => (
            <span
              key={i}
              title={steps[i]}
              className={`h-2 w-2 rounded-full ${
                status[i] === "done"
                  ? "bg-ok"
                  : status[i] === "review"
                    ? "bg-muted-foreground"
                    : i === stepIndex
                      ? "bg-info"
                      : "bg-secondary"
              }`}
            />
          ))}
        </div>
        <p className="text-[15px]">
          <span className="font-mono text-xs text-muted-foreground">
            {stepIndex + 1}/{steps.length}
          </span>
          <span className="ml-3 font-serif text-lg">{steps[stepIndex]}</span>
          {mastered[stepIndex] > 0 && (
            <span className="ml-2 text-xs text-ok">
              {mastered[stepIndex]} sous-point{mastered[stepIndex] > 1 ? "s" : ""} ✓
            </span>
          )}
          {stepState === "done" && (
            <span className="ml-2 text-xs text-ok">étape maîtrisée</span>
          )}
          {stepState === "review" && (
            <span className="ml-2 text-xs text-muted-foreground">à revoir</span>
          )}
        </p>
        <span
          ref={counterRef}
          title="Flashcards créées au fil de la leçon (à réviser)"
          className={`relative ml-auto flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm transition-all ${
            counting
              ? "bg-ok/10 text-ok ring-1 ring-ok/40"
              : cards > 0
                ? "text-ok"
                : "text-muted-foreground"
          }`}
        >
          {floats.map((id) => (
            <span key={id} className="float-plus text-ok">
              +1
            </span>
          ))}
          <span
            key={cards}
            className="card-pop inline-block font-mono tabular-nums"
          >
            {cards}
          </span>
          flashcard{cards > 1 ? "s" : ""}
        </span>
      </div>

      <div
        ref={scrollRef}
        onMouseUp={onMouseUp}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto py-6"
      >
        {messages.map((m, i) => (
          <Message key={i} role={m.role} content={m.content} />
        ))}
      </div>

      {clip && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void clipToNotes()}
          style={{ left: clip.x, top: clip.y - 42 }}
          className="fixed z-50 -translate-x-1/2 rounded-md border border-border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-xl transition-colors hover:border-primary hover:text-primary"
        >
          → Notes ({steps[stepIndex]})
        </button>
      )}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md border border-border bg-popover px-4 py-2 text-sm text-ok shadow-xl">
          {toast}
        </div>
      )}

      {/* Les mini-cartes qui naissent dans la conversation et volent vers le compteur */}
      {flyers.map((f) => (
        <div
          key={f.id}
          className="card-fly pointer-events-none fixed z-50"
          style={
            {
              left: f.x,
              top: f.y,
              "--tx": `${f.tx}px`,
              "--ty": `${f.ty}px`,
              "--rot": `${f.rot}deg`,
            } as React.CSSProperties
          }
        >
          <div className="flex h-9 w-13 flex-col gap-1 rounded-[3px] border border-border bg-popover p-1.5 shadow-2xl">
            <div className="h-[3px] w-full rounded-full bg-foreground/70" />
            <div className="h-[3px] w-3/4 rounded-full bg-foreground/40" />
            <div className="mt-auto h-[3px] w-1/2 rounded-full bg-info/80" />
          </div>
        </div>
      ))}

      <div className="border-t border-border py-4">
        {allDone && (
          <p className="mb-3 text-[15px] text-ok">
            Cours terminé. Le professeur reste là : pose-lui ce que tu veux,
            demande un point plus dur, ou fais-toi interroger.
          </p>
        )}
        <div className="mb-3 flex flex-wrap gap-2">
          {[
            { label: "Continuer →", msg: "On continue, sous-point suivant.", lead: true },
            { label: "Explique-moi autrement", msg: "Explique-moi autrement.", lead: false },
            { label: "Un exemple concret", msg: "Donne-moi un exemple concret.", lead: false },
            { label: "Trop facile, accélère", msg: "Trop facile, accélère.", lead: false },
          ].map((q) => (
            <button
              key={q.label}
              type="button"
              disabled={busy}
              onClick={() => void send(q.msg)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-40 ${
                q.lead
                  ? "border-primary text-primary hover:bg-primary/10"
                  : "border-border text-muted-foreground hover:border-primary hover:text-primary"
              }`}
            >
              {q.label}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="flex items-end gap-3"
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            placeholder="Ta réponse… (Entrée pour envoyer · sélectionne le texte du tuteur pour l'envoyer aux notes)"
            className="min-h-20 flex-1 resize-none"
          />
          <div className="flex flex-col gap-2">
            <Button type="submit" disabled={busy || !input.trim()}>
              Envoyer
            </Button>
            {lastStep ? (
              <Button
                type="button"
                variant={stepDone ? "default" : "outline"}
                size="sm"
                asChild
              >
                <Link href={`/d/${slug}#confronter`}>Terminer → me confronter</Link>
              </Button>
            ) : (
              <Button
                type="button"
                variant={stepDone ? "default" : "ghost"}
                size="sm"
                disabled={busy}
                onClick={nextStep}
                className={stepDone ? "" : "text-muted-foreground"}
              >
                {stepDone ? "Étape suivante →" : "Passer à la suite"}
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
